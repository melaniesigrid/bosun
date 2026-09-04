import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import "@/index.css";
import DraftMessages from "@/components/dashboard/DraftMessages";
import TriageBoard from "@/components/dashboard/TriageBoard";
import { batchByAssignee, digest, pingList, triage } from "@/lib/followup-core";

/**
 * A component preview harness.
 *
 * The app cannot be run without a backend, which meant until now there was no
 * way to look at a component at all — UI changes were verified by `npm run
 * build` succeeding, which proves nothing about what a person sees.
 *
 * `npm run dev` then open /preview.html. Fixtures only; nothing here is
 * imported by the app.
 */

const NOW = new Date();
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);
const daysAhead = (n) => new Date(NOW.getTime() + n * 86400000);

const people = {
  u1: { id: "u1", full_name: "Ana Diaz", ping_frequency: "daily", ai_tone: "friendly" },
  u2: { id: "u2", full_name: "Bo Feng", ping_frequency: "weekly", ai_tone: "direct" },
};

const task = (id, title, over = {}) => ({
  id,
  title,
  goal_id: "g1",
  goal_title: "Ship the Q4 pricing page",
  status: over.status ?? "pending",
  assignee_id: "assignee_id" in over ? over.assignee_id : "u1",
  deadline: over.deadline ?? null,
  created_at: over.created_at ?? daysAgo(0.2),
});

const FIXTURES = {
  "A normal morning": [
    task("1", "Draft the tier comparison", { deadline: daysAgo(3), created_at: daysAgo(9) }),
    task("2", "Rewrite the FAQ copy", { created_at: daysAgo(4) }),
    task("3", "Get legal to clear the guarantee wording", { status: "blocked", created_at: daysAgo(6) }),
    task("4", "Wire the checkout", { deadline: daysAhead(1) }),
    task("5", "Pick the launch date", { assignee_id: null, created_at: daysAgo(11) }),
    task("6", "Export the old pricing table", { assignee_id: "u2", created_at: daysAgo(3) }),
    task("7", "Ship the hero image", { status: "done", created_at: daysAgo(20) }),
  ],
  "Everything is fine": [
    task("1", "Draft the tier comparison"),
    task("2", "Rewrite the FAQ copy", { assignee_id: "u2" }),
    task("3", "Ship the hero image", { status: "done", created_at: daysAgo(20) }),
  ],
  "A bad week": [
    task("1", "Draft the tier comparison", { deadline: daysAgo(12), created_at: daysAgo(14) }),
    task("2", "Rewrite the FAQ copy", { deadline: daysAgo(6), created_at: daysAgo(9) }),
    task("3", "Wire the checkout", { deadline: daysAgo(2), created_at: daysAgo(8) }),
    task("4", "Get legal to clear the wording", { status: "blocked", created_at: daysAgo(10) }),
    task("5", "Decide the refund policy", { status: "need_help", created_at: daysAgo(5) }),
    task("6", "Pick the launch date", { assignee_id: null, created_at: daysAgo(21) }),
    task("7", "Book the announcement post", { assignee_id: null, created_at: daysAgo(18) }),
    task("8", "Migrate the old plans", { assignee_id: null, created_at: daysAgo(30) }),
    task("9", "Update the terms", { created_at: daysAgo(7) }),
  ],
  "One task, nothing wrong": [task("1", "Draft the tier comparison")],
};

function Case({ name, tasks }) {
  const buckets = triage(tasks, { usersById: people, now: NOW });
  const summary = digest(buckets, { limit: 6 });

  return (
    <section style={{ marginBottom: 56 }}>
      <p
        style={{
          fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#8a837c", margin: "0 0 14px", fontWeight: 600,
        }}
      >
        {name}
      </p>
      <TriageBoard buckets={buckets} summary={summary} />
      <div style={{ marginTop: 28 }}>
        <DraftMessages drafts={batchByAssignee(pingList(buckets))} />
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MemoryRouter>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 26px 100px" }}>
        <h1
          style={{
            fontSize: 22, fontWeight: 600, color: "#3a3a3a",
            margin: "0 0 6px", letterSpacing: "-0.02em",
          }}
        >
          TriageBoard
        </h1>
        <p style={{ fontSize: 13.5, color: "#6e6e6e", margin: "0 0 44px" }}>
          Fixtures through the real rule in <code>src/lib/followup-core.js</code>.
          No backend.
        </p>
        {Object.entries(FIXTURES).map(([name, tasks]) => (
          <Case key={name} name={name} tasks={tasks} />
        ))}
      </div>
    </MemoryRouter>
  </React.StrictMode>,
);
