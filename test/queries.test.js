import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

import {
  activity,
  agents,
  goals,
  pings,
  tasks,
  tenants,
  updates,
  users,
} from "../server/db/queries.js";

/**
 * The query layer against real Postgres.
 *
 * The tests that matter most here are the cross-tenant ones. Base44 enforced
 * isolation declaratively in each entity file; this layer has to enforce it in
 * every statement, and "every" is only true if something checks.
 */

let db;
let acme;
let rival;

/** A second workspace with its own data, used to prove nothing leaks. */
let rivalGoal;

before(async () => {
  db = await PGlite.create({ extensions: { pgcrypto, citext } });
  await db.exec(readFileSync("db/001_initial.sql", "utf8"));
});

after(async () => {
  await db?.close();
});

beforeEach(async () => {
  // Fresh workspaces per test; the schema cascades everything else away.
  await db.exec("DELETE FROM tenants");
  acme = (await tenants.create(db, "Acme")).id;
  rival = (await tenants.create(db, "Rival")).id;
  rivalGoal = (await goals.create(db, rival, { title: "Rival plans" })).id;
});

describe("tenant scoping", () => {
  it("does not list another workspace's goals", async () => {
    await goals.create(db, acme, { title: "Ours" });
    const mine = await goals.list(db, acme);
    assert.deepEqual(mine.map((g) => g.title), ["Ours"]);
  });

  it("cannot fetch another workspace's goal even with its id", async () => {
    assert.equal(await goals.get(db, acme, rivalGoal), null);
  });

  it("cannot update another workspace's goal", async () => {
    assert.equal(await goals.update(db, acme, rivalGoal, { title: "Hijacked" }), null);
    const untouched = await goals.get(db, rival, rivalGoal);
    assert.equal(untouched.title, "Rival plans");
  });

  it("cannot delete another workspace's goal", async () => {
    assert.equal(await goals.remove(db, acme, rivalGoal), null);
    assert.ok(await goals.get(db, rival, rivalGoal), "the goal should still be there");
  });

  it("does not leak tasks across workspaces", async () => {
    const ours = await goals.create(db, acme, { title: "Ours" });
    await tasks.create(db, acme, { goal_id: ours.id, title: "Our task" });
    await tasks.create(db, rival, { goal_id: rivalGoal, title: "Their task" });

    const mine = await tasks.list(db, acme);
    assert.deepEqual(mine.map((t) => t.title), ["Our task"]);
  });

  it("does not leak the activity log across workspaces", async () => {
    await activity.log(db, acme, { action_type: "ping_sent", title: "Ours" });
    await activity.log(db, rival, { action_type: "ping_sent", title: "Theirs" });

    const mine = await activity.listRecent(db, acme);
    assert.deepEqual(mine.map((a) => a.title), ["Ours"]);
  });
});

describe("tasks read their goal and assignee by join", () => {
  it("returns the current goal title rather than a stored copy", async () => {
    const goal = await goals.create(db, acme, { title: "Original" });
    const task = await tasks.create(db, acme, { goal_id: goal.id, title: "Work" });

    await goals.update(db, acme, goal.id, { title: "Renamed" });

    const fetched = await tasks.get(db, acme, task.id);
    // The Base44 schema copied goal_title onto the task, so this read went
    // stale the moment the goal was renamed.
    assert.equal(fetched.goal_title, "Renamed");
  });

  it("returns the assignee's current name and email", async () => {
    const goal = await goals.create(db, acme, { title: "G" });
    const ana = await users.create(db, acme, {
      email: "ana@acme.com",
      full_name: "Ana Diaz",
    });
    const task = await tasks.create(db, acme, {
      goal_id: goal.id,
      title: "Work",
      assignee_id: ana.id,
    });

    await users.update(db, acme, ana.id, { full_name: "Ana Rivera" });

    const fetched = await tasks.get(db, acme, task.id);
    assert.equal(fetched.assignee_name, "Ana Rivera");
    assert.equal(fetched.assignee_email, "ana@acme.com");
  });

  it("returns an unassigned task with null assignee fields, not no row", async () => {
    const goal = await goals.create(db, acme, { title: "G" });
    const task = await tasks.create(db, acme, { goal_id: goal.id, title: "Nobody's" });

    const fetched = await tasks.get(db, acme, task.id);
    assert.ok(fetched, "the LEFT JOIN must not drop the row");
    assert.equal(fetched.assignee_name, null);
  });

  it("orders a goal's tasks by sort_order", async () => {
    const goal = await goals.create(db, acme, { title: "G" });
    await tasks.create(db, acme, { goal_id: goal.id, title: "Third", sort_order: 2 });
    await tasks.create(db, acme, { goal_id: goal.id, title: "First", sort_order: 0 });
    await tasks.create(db, acme, { goal_id: goal.id, title: "Second", sort_order: 1 });

    const ordered = await tasks.listForGoal(db, acme, goal.id);
    assert.deepEqual(ordered.map((t) => t.title), ["First", "Second", "Third"]);
  });
});

describe("the update allow-list", () => {
  it("refuses a column that is not updatable rather than ignoring it", async () => {
    const goal = await goals.create(db, acme, { title: "G" });
    await assert.rejects(
      () => goals.update(db, acme, goal.id, { tenant_id: rival }),
      /unknown column\(s\): tenant_id/,
    );
  });

  it("refuses an empty patch, which would otherwise be invalid SQL", async () => {
    const goal = await goals.create(db, acme, { title: "G" });
    await assert.rejects(() => goals.update(db, acme, goal.id, {}), /empty patch/);
  });

  it("refuses an unknown column on insert", async () => {
    await assert.rejects(
      () => goals.create(db, acme, { title: "G", is_admin: true }),
      /unknown column\(s\): is_admin/,
    );
  });

  it("touches updated_at on a successful update", async () => {
    const goal = await goals.create(db, acme, { title: "G" });
    const after_ = await goals.update(db, acme, goal.id, { title: "H" });
    assert.ok(
      new Date(after_.updated_at) >= new Date(goal.updated_at),
      "updated_at should move forward",
    );
  });
});

describe("pings", () => {
  const openPing = async () => {
    const goal = await goals.create(db, acme, { title: "G" });
    const task = await tasks.create(db, acme, { goal_id: goal.id, title: "T" });
    const user = await users.create(db, acme, { email: "bo@acme.com" });
    const ping = await pings.create(db, acme, {
      task_id: task.id,
      assignee_id: user.id,
      message: "Still on track?",
    });
    return { ping, user };
  };

  it("lists a ping that has not been answered", async () => {
    const { user } = await openPing();
    const open = await pings.listOpenFor(db, acme, user.id);
    assert.equal(open.length, 1);
  });

  it("drops it from the open list once answered", async () => {
    const { ping, user } = await openPing();
    await pings.recordResponse(db, acme, ping.id, "Yes, Thursday holds.");

    assert.deepEqual(await pings.listOpenFor(db, acme, user.id), []);
  });

  it("sets the status and the timestamp together, as the CHECK requires", async () => {
    const { ping } = await openPing();
    const answered = await pings.recordResponse(db, acme, ping.id, "Blocked on legal.");

    assert.equal(answered.status, "responded");
    assert.ok(answered.responded_at, "responded_at must be set with the status");
    assert.equal(answered.response, "Blocked on legal.");
  });
});

describe("assignee views", () => {
  it("returns only that person's tasks, soonest deadline first", async () => {
    const goal = await goals.create(db, acme, { title: "G" });
    const ana = await users.create(db, acme, { email: "ana@acme.com" });
    const bo = await users.create(db, acme, { email: "bo@acme.com" });

    await tasks.create(db, acme, {
      goal_id: goal.id, title: "Later", assignee_id: ana.id, deadline: "2026-12-01",
    });
    await tasks.create(db, acme, {
      goal_id: goal.id, title: "Sooner", assignee_id: ana.id, deadline: "2026-09-10",
    });
    await tasks.create(db, acme, {
      goal_id: goal.id, title: "Undated", assignee_id: ana.id,
    });
    await tasks.create(db, acme, { goal_id: goal.id, title: "Bo's", assignee_id: bo.id });

    const mine = await tasks.listForAssignee(db, acme, ana.id);
    assert.deepEqual(mine.map((t) => t.title), ["Sooner", "Later", "Undated"]);
  });
});

describe("members and settings", () => {
  it("finds a member regardless of the case they typed", async () => {
    await users.create(db, acme, { email: "Ana@Acme.com" });
    const found = await users.findByEmail(db, acme, "ana@acme.com");
    assert.ok(found);
  });

  it("does not find a member of another workspace", async () => {
    await users.create(db, rival, { email: "spy@rival.com" });
    assert.equal(await users.findByEmail(db, acme, "spy@rival.com"), null);
  });

  it("stores the agent settings the scheduler reads", async () => {
    const u = await users.create(db, acme, { email: "lead@acme.com" });
    const saved = await users.update(db, acme, u.id, {
      ping_frequency: "weekly",
      ai_tone: "direct",
      onboarded: true,
    });
    assert.equal(saved.ping_frequency, "weekly");
    assert.equal(saved.ai_tone, "direct");
    assert.equal(saved.onboarded, true);
  });
});

describe("updates and agents", () => {
  it("records a status update against a task", async () => {
    const goal = await goals.create(db, acme, { title: "G" });
    const task = await tasks.create(db, acme, { goal_id: goal.id, title: "T" });
    const u = await users.create(db, acme, { email: "ana@acme.com" });

    await updates.create(db, acme, {
      task_id: task.id, user_id: u.id, status: "blocked", message: "Waiting on legal",
    });

    const [row] = await updates.listForTask(db, acme, task.id);
    assert.equal(row.status, "blocked");
    assert.equal(row.message, "Waiting on legal");
  });

  it("keeps agents inside their workspace", async () => {
    await agents.create(db, acme, { name: "Bosun" });
    await agents.create(db, rival, { name: "Theirs" });
    assert.deepEqual((await agents.list(db, acme)).map((a) => a.name), ["Bosun"]);
  });

  it("stores activity metadata as a document", async () => {
    const logged = await activity.log(db, acme, {
      action_type: "workload_balanced",
      title: "Moved two tasks off Ana",
      metadata: { moved: 2, from: "ana" },
    });
    assert.deepEqual(logged.metadata, { moved: 2, from: "ana" });
  });
});
