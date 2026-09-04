/**
 * Run Bosun against the real Northbound portfolio, with no backend.
 *
 *   npm run demo
 *
 * Boots Postgres in-process (PGlite), applies db/001_initial.sql, seeds the
 * portfolio through server/db/queries.js, then runs the real follow-up rule
 * over it and writes demo/northbound.html.
 *
 * Every part of this is the shipping code: the schema, the queries, the triage,
 * the digest and the ping copy. The only thing invented is the task list.
 *
 * The output is deliberately NOT written into site/. site/ is published to
 * GitHub Pages, and the workspace rule — the one shipshape-brand exists to
 * enforce — is that the real portfolio does not go on a public URL.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

import { goals, tasks, tenants, updates, users } from "../server/db/queries.js";
import { batchByAssignee, digest, pingList, triage } from "../src/lib/followup-core.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "demo/northbound.html");

const NOW = new Date();
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);
const daysAhead = (n) => new Date(NOW.getTime() + n * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------- the data
//
// The products are real. The task lists are a plausible reconstruction, not a
// record of what has actually been done.

const TEAM = [
  { email: "melaniesigridab@gmail.com", full_name: "Melanie Baratto", role: "lead",
    ping_frequency: "daily", ai_tone: "direct" },
];

const PORTFOLIO = [
  {
    goal: "ZipQuarry: first paying customer",
    description: "The marketing site is live at zipquarry.com. Nothing has been sold.",
    target: daysAhead(21),
    tasks: [
      { title: "Publish the price on the marketing site", owner: 0, due: daysAgo(9), quiet: 12 },
      { title: "Wire Stripe checkout end to end", owner: 0, due: daysAgo(2), quiet: 6 },
      { title: "Send 20 outbound emails to local service businesses", owner: 0, due: daysAhead(4), quiet: 5 },
      { title: "Confirm CASL compliance on the outbound sequence", owner: null, due: daysAhead(10), quiet: 14 },
      { title: "Move marketing edits into zipquarry-platform/www", owner: 0, status: "done", quiet: 20 },
    ],
  },
  {
    goal: "Shipshape: run it against a live database",
    description: "Domain is complete and tested. The app has never been installed or run.",
    target: daysAhead(10),
    tasks: [
      { title: "pnpm install and push the schema to a Neon branch", owner: 0, due: daysAgo(5), quiet: 11 },
      { title: "Seed the built-in rubrics and demo projects", owner: 0, due: daysAhead(1), quiet: 3 },
      { title: "Sign in once with the magic link and score one project", owner: 0, due: daysAhead(2), quiet: 3 },
    ],
  },
  {
    goal: "Bosun: answer D1 to D4",
    description: "The follow-up loop is half built. Four decisions block the rest.",
    target: daysAhead(5),
    tasks: [
      { title: "D1 — pick the server shape: Node API or Next.js", owner: 0, due: daysAhead(2), quiet: 0.2 },
      { title: "D2 — trademark and domain check on the name", owner: 0, due: daysAhead(2), quiet: 1 },
      { title: "D4 — decide whether Bosun gets finished or parked", owner: 0, due: daysAhead(1), quiet: 0.2 },
      { title: "Deliver the first real nudge on a schedule", owner: 0, status: "need_help", quiet: 2 },
    ],
  },
  {
    goal: "Windward: make the five pillars trustworthy",
    description: "Rails 8 API plus a Python analytics engine. Every displayed number is computed.",
    target: daysAhead(30),
    tasks: [
      { title: "Pin down the market-data ingestion source", owner: 0, due: daysAgo(1), quiet: 8 },
      { title: "Write the grading logic tests nobody can argue with", owner: null, due: daysAhead(12), quiet: 16 },
      { title: "Decide what happens when a pillar has no data", owner: null, quiet: 16 },
    ],
  },
  {
    goal: "ReconAI: one pilot with a bookkeeping firm",
    description: "Claude reads and matches; TypeScript does every calculation.",
    target: daysAhead(35),
    tasks: [
      { title: "Build the invoice/PO matching eval set", owner: 0, due: daysAhead(8), quiet: 4 },
      { title: "Find three bookkeeping firms to approach", owner: null, quiet: 19 },
      { title: "Cap per-tenant token spend before anyone uploads", owner: 0, status: "blocked", quiet: 7 },
    ],
  },
  {
    goal: "Quotefront: photo to findings",
    description: "Prospects upload job details and photos; the app returns a structured estimate.",
    target: daysAhead(40),
    tasks: [
      { title: "Harden the vision pipeline against unusable photos", owner: 0, due: daysAhead(15), quiet: 6 },
      { title: "Decide the estimate range the model is allowed to state", owner: null, quiet: 22 },
    ],
  },
  {
    goal: "Studio: move the repos into the org",
    description: "Everything still lives on a personal GitHub account.",
    target: daysAhead(14),
    tasks: [
      { title: "Create the org and move the eight product repos", owner: 0, due: daysAgo(4), quiet: 25 },
      { title: "Re-point the Pages and Vercel deployments", owner: null, quiet: 25 },
    ],
  },
];

// ------------------------------------------------------------------- seed

async function seed(db) {
  const tenant = (await tenants.create(db, "Northbound Software Studio")).id;

  const team = [];
  for (const person of TEAM) {
    const u = await users.create(db, tenant, {
      email: person.email, full_name: person.full_name, role: person.role,
    });
    await users.update(db, tenant, u.id, {
      ping_frequency: person.ping_frequency, ai_tone: person.ai_tone, onboarded: true,
    });
    team.push({ ...u, ...person });
  }

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

      // Backdate the row so "quiet for N days" is real rather than asserted.
      await db.query(`UPDATE tasks SET created_at = $2 WHERE id = $1`, [
        created.id, daysAgo(t.quiet ?? 1).toISOString(),
      ]);

      if (t.status === "blocked" || t.status === "need_help") {
        const u = await updates.create(db, tenant, {
          task_id: created.id, user_id: team[0].id,
          status: t.status === "blocked" ? "blocked" : "need_help",
          message: t.status === "blocked"
            ? "Waiting on a decision about the spend ceiling."
            : "Not sure which delivery channel to build first.",
        });
        await db.query(`UPDATE updates SET created_at = $2 WHERE id = $1`, [
          u.id, daysAgo(t.quiet ?? 1).toISOString(),
        ]);
      }
    }
  }

  return { tenant, team };
}

// ----------------------------------------------------------------- render

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const LABEL = {
  overdue: "Overdue", quiet: "Gone quiet", due_soon: "Due soon",
  needs_lead: "Needs you", ok: "On track", done: "Done",
};

const age = (item) => {
  const d = Math.round(item.daysQuiet);
  return `${d} day${d === 1 ? "" : "s"} silent`;
};

function row(item) {
  const t = item.task;
  const who = item.assignee?.full_name ?? "<em>nobody</em>";
  const due = t.deadline
    ? `due ${new Date(t.deadline).toLocaleDateString("en-CA")}`
    : "no deadline";
  return `<li>
    <span class="state state--${item.state}">${LABEL[item.state]}</span>
    <div>
      <b>${esc(t.title)}</b>
      <p>${esc(t.goal_title)} &middot; ${who} &middot; ${due} &middot; ${age(item)}</p>
    </div>
  </li>`;
}

function render({ buckets, summary, pings, owedCount, tenantName }) {
  const c = summary.counts;
  const stat = (n, label, tone = "") =>
    `<div class="stat ${tone}"><b>${n}</b><span>${label}</span></div>`;

  const section = (title, note, items) =>
    !items.length ? "" : `<section>
      <h2>${title}</h2>
      <p class="sub">${note}</p>
      <ul class="rows">${items.map(row).join("")}</ul>
    </section>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bosun — ${esc(tenantName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap" rel="stylesheet">
<style>
  :root{--canvas:#ebe7e2;--surface:#eeeae6;--ink:#2e2a26;--ink-2:#665f57;--line:#d9d3cc;
    --violet:#7d4fd1;--red:#c0392b;--amber:#b9770e;--green:#1e8449;
    --out:-8px -8px 16px rgba(255,250,244,.78),8px 8px 18px rgba(160,143,126,.31);
    --in:inset -4px -4px 8px rgba(255,250,244,.68),inset 4px 4px 8px rgba(160,143,126,.24);}
  *{box-sizing:border-box}
  body{margin:0;background:var(--canvas);color:var(--ink);
    font:400 16px/1.6 'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:940px;margin:0 auto;padding:44px 26px 90px}
  h1{font-family:Archivo,sans-serif;font-weight:600;letter-spacing:-.03em;
    font-size:clamp(28px,4.6vw,42px);margin:0 0 6px}
  .lede{color:var(--ink-2);font-weight:300;margin:0 0 34px}
  h2{font-family:Archivo,sans-serif;font-weight:600;letter-spacing:-.022em;
    font-size:21px;margin:0 0 4px}
  .sub{color:var(--ink-2);font-weight:300;font-size:14.5px;margin:0 0 18px}
  section{margin-bottom:44px}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:14px;margin-bottom:44px}
  .stat{background:var(--surface);border-radius:16px;padding:18px 20px;box-shadow:var(--out)}
  .stat b{font-family:Archivo,sans-serif;font-size:30px;font-weight:600;display:block;line-height:1}
  .stat span{font-size:12px;color:var(--ink-2);letter-spacing:.06em;text-transform:uppercase}
  .stat.bad b{color:var(--red)} .stat.warn b{color:var(--amber)} .stat.good b{color:var(--green)}
  .rows{list-style:none;margin:0;padding:10px;border-radius:18px;box-shadow:var(--in)}
  .rows li{display:flex;gap:16px;align-items:flex-start;padding:14px 16px}
  .rows li+li{border-top:1px solid var(--line)}
  .rows b{font-weight:500;font-size:15px}
  .rows p{margin:2px 0 0;font-size:13px;color:var(--ink-2);font-weight:300}
  .state{flex:none;width:96px;font-size:10.5px;font-weight:600;letter-spacing:.06em;
    text-transform:uppercase;padding-top:3px;color:var(--ink-2)}
  .state--overdue{color:var(--red)} .state--quiet{color:var(--amber)}
  .state--needs_lead{color:var(--violet)} .state--due_soon{color:var(--ink-2)}
  .pings{display:grid;gap:12px}
  .ping{background:var(--surface);border-radius:14px;padding:16px 18px;box-shadow:var(--out)}
  .ping .to{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-2);margin-bottom:6px}
  .ping p{margin:0;font-size:14.5px}
  footer{margin-top:60px;border-top:1px solid var(--line);padding-top:22px;
    font-size:13px;color:var(--ink-2);font-weight:300}
  @media(max-width:640px){.rows li{flex-direction:column;gap:6px}.state{width:auto}}
</style></head><body><div class="wrap">

<h1>Good morning, Melanie.</h1>
<p class="lede">${esc(tenantName)} &middot; ${c.open} open across ${PORTFOLIO.length} goals &middot;
  ${new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}</p>

<div class="stats">
  ${stat(c.overdue, "Overdue", "bad")}
  ${stat(c.quiet, "Gone quiet", "warn")}
  ${stat(c.needsLead, "Needs you", "")}
  ${stat(c.dueSoon, "Due soon", "")}
  ${stat(c.done, "Done", "good")}
</div>

${section("Needs you", "Someone reported a problem. Bosun does not chase these — you unblock them.", summary.needsYou)}
${section("Slipping", "Overdue or silent past the cadence, worst first.", summary.slipping)}
${section("Nobody owns this", "Work with no assignee. It cannot go quiet, because it never started.", summary.unassigned)}

<section>
  <h2>What Bosun would send</h2>
  <p class="sub">${pings.length} message${pings.length === 1 ? "" : "s"} covering ${owedCount}
    item${owedCount === 1 ? "" : "s"}, in each person's configured tone, held until working
    hours. One message per person, not one per task. Nothing is sent by this demo.</p>
  <div class="pings">
    ${pings.map((p) => `<div class="ping">
      <div class="to">To ${esc(p.assignee.full_name)} &middot; ${p.items.length} item${p.items.length === 1 ? "" : "s"}</div>
      <p>${esc(p.message)}</p>
    </div>`).join("")}
  </div>
</section>

<footer>
  Generated by <code>npm run demo</code> from Bosun's real schema, queries and
  follow-up rule. The products are real; the task lists are a plausible
  reconstruction, not a record of work done. Not published anywhere.
</footer>
</div></body></html>`;
}

// ------------------------------------------------------------------- main

const db = await PGlite.create({ extensions: { pgcrypto, citext } });
await db.exec(readFileSync(resolve(ROOT, "db/001_initial.sql"), "utf8"));

const { tenant } = await seed(db);

const allTasks = await tasks.list(db, tenant, 500);
const allUpdates = await updates.listRecent(db, tenant, 500);
const team = await users.listMembers(db, tenant);

// Newest update per task — the clock the quiet rule reads.
const updatesByTask = {};
for (const u of allUpdates) {
  if (!updatesByTask[u.task_id]) updatesByTask[u.task_id] = u.created_at;
}
const usersById = Object.fromEntries(team.map((u) => [u.id, u]));

const buckets = triage(allTasks, { updatesByTask, usersById, now: NOW });
const summary = digest(buckets, { limit: 6 });
// One message per person, not one per task. Running this against the real
// portfolio is what showed why: thirteen separate nudges to the same inbox.
const owed = pingList(buckets);
const pings = batchByAssignee(owed);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, render({
  buckets, summary, pings, owedCount: owed.length,
  tenantName: "Northbound Software Studio",
}), "utf8");

await db.close();

const c = summary.counts;
console.log(`
  ${c.total} tasks across ${PORTFOLIO.length} goals
  ${c.overdue} overdue · ${c.quiet} quiet · ${c.needsLead} needs you · ${c.dueSoon} due soon · ${c.done} done
  ${pings.length} message(s) to ${pings.length} person/people, covering ${owed.length} items

  ${OUT}
`);
