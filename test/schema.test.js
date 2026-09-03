import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/**
 * Runs db/001_initial.sql against a real Postgres (PGlite, the engine compiled
 * to WASM) so the schema is executed rather than eyeballed.
 *
 * These assert the decisions the file documents. Each one is a rule the
 * application currently enforces by hand and is meant to stop enforcing.
 */

let db;
let tenant;

const one = async (sql, params) => (await db.query(sql, params)).rows[0];

const newTenant = async (name = "Acme") =>
  (await one("INSERT INTO tenants (name) VALUES ($1) RETURNING id", [name])).id;

const newUser = async (email, tenantId = tenant) =>
  (await one(
    "INSERT INTO users (tenant_id, email) VALUES ($1, $2) RETURNING id",
    [tenantId, email],
  )).id;

const newGoal = async (title = "Ship it", tenantId = tenant) =>
  (await one(
    "INSERT INTO goals (tenant_id, title) VALUES ($1, $2) RETURNING id",
    [tenantId, title],
  )).id;

const newTask = async (goalId, extra = {}) =>
  (await one(
    `INSERT INTO tasks (tenant_id, goal_id, title, estimated_hours)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [tenant, goalId, extra.title ?? "A task", extra.hours ?? null],
  )).id;

const countOf = async (table, where, params) =>
  Number((await one(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params)).n);

before(async () => {
  db = await PGlite.create({ extensions: { pgcrypto, citext } });
  await db.exec(readFileSync("db/001_initial.sql", "utf8"));
  tenant = await newTenant();
});

after(async () => {
  await db?.close();
});

describe("the schema applies", () => {
  it("creates every table the app reads", async () => {
    const { rows } = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    assert.deepEqual(
      rows.map((r) => r.table_name),
      ["agent_activity", "agents", "goals", "pings", "tasks", "tenants", "updates", "users"],
    );
  });
});

describe("tenant isolation", () => {
  it("refuses a row belonging to no tenant", async () => {
    await assert.rejects(
      () => db.query(
        "INSERT INTO goals (tenant_id, title) VALUES ($1, $2)",
        ["00000000-0000-0000-0000-000000000000", "Orphan"],
      ),
      /foreign key/i,
    );
  });

  it("lets the same person belong to two workspaces", async () => {
    const other = await newTenant("Other");
    await newUser("shared@example.com");
    await newUser("shared@example.com", other);
    assert.equal(await countOf("users", "email = $1", ["shared@example.com"]), 2);
  });

  it("refuses the same address twice inside one workspace", async () => {
    await newUser("dupe@example.com");
    await assert.rejects(() => newUser("dupe@example.com"), /duplicate key/i);
  });

  it("treats an address as the same regardless of case", async () => {
    await newUser("Case@Example.com");
    await assert.rejects(() => newUser("case@example.com"), /duplicate key/i);
  });
});

describe("a goal owns its tasks", () => {
  it("takes its tasks with it when deleted", async () => {
    const goal = await newGoal();
    await newTask(goal);
    await newTask(goal);
    assert.equal(await countOf("tasks", "goal_id = $1", [goal]), 2);

    // src/api/goals.remove does this by hand today. It should not have to.
    await db.query("DELETE FROM goals WHERE id = $1", [goal]);
    assert.equal(await countOf("tasks", "goal_id = $1", [goal]), 0);
  });

  it("keeps the audit trail after the goal it describes is gone", async () => {
    const goal = await newGoal("Doomed");
    await db.query(
      `INSERT INTO agent_activity (tenant_id, action_type, title, related_goal_id)
       VALUES ($1, 'goal_analyzed', 'Analyzed Doomed', $2)`,
      [tenant, goal],
    );

    await db.query("DELETE FROM goals WHERE id = $1", [goal]);

    const row = await one(
      "SELECT title, related_goal_id FROM agent_activity WHERE title = $1",
      ["Analyzed Doomed"],
    );
    assert.equal(row.title, "Analyzed Doomed");
    assert.equal(row.related_goal_id, null, "the link is dropped, the record is not");
  });

  it("keeps an unassigned task, since that is the state worth surfacing", async () => {
    const goal = await newGoal();
    const user = await newUser("leaver@example.com");
    const task = await one(
      `INSERT INTO tasks (tenant_id, goal_id, title, assignee_id)
       VALUES ($1, $2, 'Orphaned work', $3) RETURNING id`,
      [tenant, goal, user],
    );

    await db.query("DELETE FROM users WHERE id = $1", [user]);

    const row = await one("SELECT assignee_id FROM tasks WHERE id = $1", [task.id]);
    assert.equal(row.assignee_id, null);
  });
});

describe("estimated_hours", () => {
  it("accepts a fractional estimate", async () => {
    const goal = await newGoal();
    const id = await newTask(goal, { hours: 3.5 });
    assert.equal(Number((await one("SELECT estimated_hours FROM tasks WHERE id = $1", [id])).estimated_hours), 3.5);
  });

  it("accepts no estimate at all", async () => {
    const goal = await newGoal();
    const id = await newTask(goal, { hours: null });
    assert.equal((await one("SELECT estimated_hours FROM tasks WHERE id = $1", [id])).estimated_hours, null);
  });

  it("refuses zero, which is what a coerced null used to become", async () => {
    const goal = await newGoal();
    await assert.rejects(() => newTask(goal, { hours: 0 }), /check constraint/i);
  });

  it("refuses a negative estimate", async () => {
    const goal = await newGoal();
    await assert.rejects(() => newTask(goal, { hours: -2 }), /check constraint/i);
  });
});

describe("a ping is answered or it is not", () => {
  const ping = async (status, respondedAt) => {
    const goal = await newGoal();
    const task = await newTask(goal);
    const user = await newUser(`p${Math.random()}@example.com`);
    return db.query(
      `INSERT INTO pings (tenant_id, task_id, assignee_id, status, responded_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenant, task, user, status, respondedAt],
    );
  };

  it("allows a sent ping with no reply", async () => {
    await ping("sent", null);
  });

  it("allows a responded ping with a timestamp", async () => {
    await ping("responded", new Date().toISOString());
  });

  it("refuses a responded ping with no timestamp", async () => {
    await assert.rejects(() => ping("responded", null), /ping_response_consistent/);
  });

  it("refuses a timestamp on a ping that was never answered", async () => {
    await assert.rejects(
      () => ping("sent", new Date().toISOString()),
      /ping_response_consistent/,
    );
  });
});

describe("enums close the sets they describe", () => {
  it("refuses an action type the audit log does not define", async () => {
    await assert.rejects(
      () => db.query(
        `INSERT INTO agent_activity (tenant_id, action_type, title)
         VALUES ($1, 'went_rogue', 'Nope')`,
        [tenant],
      ),
      /invalid input value for enum/i,
    );
  });

  it("refuses a task status the UI cannot render", async () => {
    const goal = await newGoal();
    await assert.rejects(
      () => db.query(
        `INSERT INTO tasks (tenant_id, goal_id, title, status)
         VALUES ($1, $2, 'Bad', 'almost_done')`,
        [tenant, goal],
      ),
      /invalid input value for enum/i,
    );
  });
});
