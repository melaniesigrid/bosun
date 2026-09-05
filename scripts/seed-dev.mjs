/**
 * Seed the local development database with the Northbound portfolio.
 *
 *   npm run seed
 *
 * Safe to re-run: it clears the workspace it owns and rebuilds it. It refuses
 * to touch a real database — if DATABASE_URL is set, it stops.
 */

import { closeDb, getDb, migrate } from "../server/db/client.js";
import { goals, tasks, tenants, updates, users } from "../server/db/queries.js";
import { PORTFOLIO, TEAM, daysAgo, iso } from "./portfolio.mjs";

if (process.env.DATABASE_URL) {
  console.error(
    "\n  Refusing to seed: DATABASE_URL is set.\n" +
      "  This script is for the local PGlite database only.\n",
  );
  process.exit(1);
}

const db = await getDb();
await migrate(db);

const WORKSPACE = "Northbound Software Studio";

// Start clean. The schema cascades everything else off the tenant.
await db.query("DELETE FROM tenants WHERE name = $1", [WORKSPACE]);

const tenant = (await tenants.create(db, WORKSPACE)).id;

const team = [];
for (const person of TEAM) {
  const u = await users.create(db, tenant, {
    email: person.email,
    full_name: person.full_name,
    role: person.role,
  });
  await users.update(db, tenant, u.id, {
    ping_frequency: person.ping_frequency,
    ai_tone: person.ai_tone,
    onboarded: true,
  });
  team.push(u);
}

let taskCount = 0;
for (const entry of PORTFOLIO) {
  const goal = await goals.create(db, tenant, {
    title: entry.goal,
    description: entry.description,
    owner_id: team[0].id,
    status: "active",
    target_date: iso(entry.target),
  });

  let order = 0;
  for (const t of entry.tasks) {
    const created = await tasks.create(db, tenant, {
      goal_id: goal.id,
      title: t.title,
      assignee_id: t.owner === null ? null : team[t.owner].id,
      deadline: t.due ? iso(t.due) : null,
      status: t.status ?? "pending",
      sort_order: order++,
      created_by_ai: false,
    });
    taskCount++;

    // Backdate so "quiet for N days" is real rather than asserted.
    await db.query("UPDATE tasks SET created_at = $2 WHERE id = $1", [
      created.id,
      daysAgo(t.quiet ?? 1).toISOString(),
    ]);

    if (t.status === "blocked" || t.status === "need_help") {
      const u = await updates.create(db, tenant, {
        task_id: created.id,
        user_id: team[0].id,
        status: t.status === "blocked" ? "blocked" : "need_help",
        message:
          t.status === "blocked"
            ? "Waiting on a decision about the spend ceiling."
            : "Not sure which delivery channel to build first.",
      });
      await db.query("UPDATE updates SET created_at = $2 WHERE id = $1", [
        u.id,
        daysAgo(t.quiet ?? 1).toISOString(),
      ]);
    }
  }
}

await closeDb();

console.log(`
  Seeded ${WORKSPACE}
  ${PORTFOLIO.length} goals · ${taskCount} tasks · ${team.length} member(s)

  Sign in at http://localhost:5178/login as:
  ${TEAM.map((p) => `  ${p.email}`).join("\n")}
`);
