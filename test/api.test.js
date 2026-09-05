import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

import { goals, tasks, tenants, users } from "../server/db/queries.js";
import { createApp } from "../server/http/app.js";

/**
 * The HTTP layer against a real Postgres.
 *
 * The query layer already refuses to cross tenants. This file exists because
 * that is not where isolation gets lost — it gets lost in a handler that takes
 * a tenant from a request body, or forgets to require a session at all. Both
 * are tested here by asking for another workspace's rows by id.
 */

let db;
let server;
let base;

// Acme
let acme;
let ana;      // lead
let bo;       // member
let acmeGoal;

// Rival, whose rows must never be visible above.
let rival;
let rivalGoal;
let rivalTask;

const url = (path) => `${base}${path}`;

async function call(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(url(path), {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return {
    status: res.status,
    cookie: res.headers.getSetCookie?.().join("; ") ?? res.headers.get("set-cookie") ?? "",
    body: text ? JSON.parse(text) : null,
  };
}

async function signIn(email) {
  const res = await call("/api/auth/dev-login", { method: "POST", body: { email } });
  assert.equal(res.status, 200, `sign-in failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.cookie.split(";")[0];
}

before(async () => {
  process.env.BOSUN_DEV_LOGIN = "1";
  process.env.SESSION_SECRET = "test-secret";

  db = await PGlite.create({ extensions: { pgcrypto, citext } });
  await db.exec(readFileSync("db/001_initial.sql", "utf8"));

  server = createApp(db).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await db?.close();
});

beforeEach(async () => {
  await db.exec("DELETE FROM tenants");

  acme = (await tenants.create(db, "Acme")).id;
  ana = await users.create(db, acme, { email: "ana@acme.com", full_name: "Ana Diaz", role: "lead" });
  bo = await users.create(db, acme, { email: "bo@acme.com", full_name: "Bo Feng", role: "member" });
  acmeGoal = await goals.create(db, acme, { title: "Ship the pricing page" });

  rival = (await tenants.create(db, "Rival")).id;
  const spy = await users.create(db, rival, { email: "spy@rival.com", role: "lead" });
  rivalGoal = await goals.create(db, rival, { title: "Rival plans" });
  rivalTask = await tasks.create(db, rival, { goal_id: rivalGoal.id, title: "Rival work" });
  void spy;
});

describe("authentication", () => {
  it("refuses every data route without a session", async () => {
    for (const path of ["/api/me", "/api/goals", "/api/tasks", "/api/team", "/api/activity"]) {
      const res = await call(path);
      assert.equal(res.status, 401, `${path} should require a session`);
      assert.equal(res.body.error, "auth_required");
    }
  });

  it("refuses a forged cookie", async () => {
    const res = await call("/api/me", { cookie: "bosun_session=made.up" });
    assert.equal(res.status, 401);
  });

  it("signs in a known address and returns the person", async () => {
    const res = await call("/api/auth/dev-login", {
      method: "POST", body: { email: "ana@acme.com" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.email, "ana@acme.com");
    assert.match(res.cookie, /bosun_session=/);
    assert.match(res.cookie, /HttpOnly/);
  });

  it("does not reveal whether an unknown address exists as an account", async () => {
    const res = await call("/api/auth/dev-login", {
      method: "POST", body: { email: "nobody@nowhere.com" },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "user_not_registered");
  });

  it("logging out clears the cookie", async () => {
    const res = await call("/api/auth/logout", { method: "POST" });
    assert.match(res.cookie, /Max-Age=0/);
  });

  it("reports the workspace name with the person", async () => {
    const cookie = await signIn("ana@acme.com");
    const res = await call("/api/me", { cookie });
    assert.equal(res.body.workspace_name, "Acme");
  });
});

describe("tenant isolation at the HTTP layer", () => {
  it("cannot read another workspace's goal by id", async () => {
    const cookie = await signIn("ana@acme.com");
    const res = await call(`/api/goals/${rivalGoal.id}`, { cookie });
    assert.equal(res.status, 404, "must not leak that the row exists");
  });

  it("cannot update another workspace's goal", async () => {
    const cookie = await signIn("ana@acme.com");
    const res = await call(`/api/goals/${rivalGoal.id}`, {
      method: "PATCH", cookie, body: { title: "Hijacked" },
    });
    assert.equal(res.status, 404);
    assert.equal((await goals.get(db, rival, rivalGoal.id)).title, "Rival plans");
  });

  it("cannot delete another workspace's goal", async () => {
    const cookie = await signIn("ana@acme.com");
    assert.equal((await call(`/api/goals/${rivalGoal.id}`, { method: "DELETE", cookie })).status, 404);
    assert.ok(await goals.get(db, rival, rivalGoal.id));
  });

  it("cannot delete another workspace's task", async () => {
    const cookie = await signIn("ana@acme.com");
    assert.equal((await call(`/api/tasks/${rivalTask.id}`, { method: "DELETE", cookie })).status, 404);
  });

  it("lists only its own rows", async () => {
    const cookie = await signIn("ana@acme.com");
    const res = await call("/api/goals", { cookie });
    assert.deepEqual(res.body.map((g) => g.title), ["Ship the pricing page"]);
  });

  it("ignores a tenant_id supplied in the body", async () => {
    // The attack this guards: writing into another workspace by asking nicely.
    const cookie = await signIn("ana@acme.com");
    const res = await call("/api/goals", {
      method: "POST", cookie, body: { title: "Trojan", tenant_id: rival },
    });
    assert.equal(res.status, 400, "tenant_id is not an updatable column");

    const theirs = await goals.list(db, rival);
    assert.deepEqual(theirs.map((g) => g.title), ["Rival plans"]);
  });

  it("cannot reassign a task into another workspace's goal", async () => {
    const cookie = await signIn("ana@acme.com");
    const mine = await call("/api/tasks", {
      method: "POST", cookie, body: { goal_id: acmeGoal.id, title: "Mine" },
    });
    assert.equal(mine.status, 201);

    const moved = await call(`/api/tasks/${mine.body.id}`, {
      method: "PATCH", cookie, body: { goal_id: rivalGoal.id },
    });

    // This returned 200 before the foreign keys became composite. goal_id
    // referenced goals(id) alone, so any goal satisfied it — and because tasks
    // are read with the goal title joined on, one workspace could pull another
    // workspace's goal title into its own task list.
    assert.equal(moved.status, 500, "the composite FK must refuse the write");

    const stillMine = await call(`/api/tasks?goal_id=${acmeGoal.id}`, { cookie });
    assert.deepEqual(stillMine.body.map((t) => t.title), ["Mine"]);
  });

  it("cannot assign a task to a person in another workspace", async () => {
    const cookie = await signIn("ana@acme.com");
    const spy = await users.findByEmail(db, rival, "spy@rival.com");
    const res = await call("/api/tasks", {
      method: "POST", cookie,
      body: { goal_id: acmeGoal.id, title: "Leak", assignee_id: spy.id },
    });
    assert.ok(res.status >= 400, "must not accept a foreign assignee");
  });
});

describe("goals and tasks", () => {
  it("creates, reads back, and cascades on delete", async () => {
    const cookie = await signIn("ana@acme.com");

    const goal = await call("/api/goals", { method: "POST", cookie, body: { title: "Launch" } });
    assert.equal(goal.status, 201);

    const t = await call("/api/tasks", {
      method: "POST", cookie, body: { goal_id: goal.body.id, title: "Write the copy" },
    });
    assert.equal(t.status, 201);

    const forGoal = await call(`/api/tasks?goal_id=${goal.body.id}`, { cookie });
    assert.deepEqual(forGoal.body.map((x) => x.title), ["Write the copy"]);

    assert.equal((await call(`/api/goals/${goal.body.id}`, { method: "DELETE", cookie })).status, 200);
    assert.deepEqual((await call(`/api/tasks?goal_id=${goal.body.id}`, { cookie })).body, []);
  });

  it("joins the goal title onto a task rather than storing a copy", async () => {
    const cookie = await signIn("ana@acme.com");
    await call("/api/tasks", {
      method: "POST", cookie, body: { goal_id: acmeGoal.id, title: "Work" },
    });
    await call(`/api/goals/${acmeGoal.id}`, {
      method: "PATCH", cookie, body: { title: "Renamed" },
    });
    const list = await call("/api/tasks", { cookie });
    assert.equal(list.body[0].goal_title, "Renamed");
  });

  it("returns my own tasks for mine=1", async () => {
    const cookie = await signIn("ana@acme.com");
    await call("/api/tasks", {
      method: "POST", cookie, body: { goal_id: acmeGoal.id, title: "Mine", assignee_id: ana.id },
    });
    await call("/api/tasks", {
      method: "POST", cookie, body: { goal_id: acmeGoal.id, title: "Theirs", assignee_id: bo.id },
    });
    const mine = await call("/api/tasks?mine=1", { cookie });
    assert.deepEqual(mine.body.map((t) => t.title), ["Mine"]);
  });

  it("rejects an unknown column instead of ignoring it", async () => {
    const cookie = await signIn("ana@acme.com");
    const res = await call("/api/goals", {
      method: "POST", cookie, body: { title: "X", is_admin: true },
    });
    assert.equal(res.status, 400);
  });
});

describe("settings", () => {
  it("saves agent settings and renames the workspace, not the person", async () => {
    const cookie = await signIn("ana@acme.com");
    const res = await call("/api/me", {
      method: "PATCH", cookie,
      body: { ai_tone: "direct", ping_frequency: "weekly", workspace_name: "Acme Studio" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ai_tone, "direct");

    // The name went to the tenant, where it is stored once.
    assert.equal((await tenants.get(db, acme)).name, "Acme Studio");
    assert.equal((await call("/api/me", { cookie })).body.workspace_name, "Acme Studio");
  });
});

describe("team", () => {
  it("lets a lead invite someone", async () => {
    const cookie = await signIn("ana@acme.com");
    const res = await call("/api/team", {
      method: "POST", cookie, body: { email: "cy@acme.com" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.role, "member");
  });

  it("refuses a member trying to invite", async () => {
    const cookie = await signIn("bo@acme.com");
    const res = await call("/api/team", {
      method: "POST", cookie, body: { email: "cy@acme.com" },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "lead_required");
  });

  it("refuses a member trying to remove anyone", async () => {
    const cookie = await signIn("bo@acme.com");
    assert.equal((await call(`/api/team/${ana.id}`, { method: "DELETE", cookie })).status, 403);
  });

  it("will not let a lead remove themselves", async () => {
    const cookie = await signIn("ana@acme.com");
    const res = await call(`/api/team/${ana.id}`, { method: "DELETE", cookie });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "cannot_remove_self");
  });

  it("does not list another workspace's members", async () => {
    const cookie = await signIn("ana@acme.com");
    const res = await call("/api/team", { cookie });
    assert.deepEqual(res.body.map((m) => m.email).sort(), ["ana@acme.com", "bo@acme.com"]);
  });
});

describe("planning", () => {
  it("says plainly that it is not implemented rather than pretending", async () => {
    const cookie = await signIn("ana@acme.com");
    const res = await call("/api/plan/tasks", { method: "POST", cookie, body: {} });
    assert.equal(res.status, 501);
    assert.match(res.body.message, /Base44/);
  });
});
