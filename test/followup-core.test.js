import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cadenceDays,
  classify,
  daysBetween,
  digest,
  nextSendTime,
  pingList,
  batchByAssignee,
  pingMessage,
  shouldPing,
  triage,
  withinWorkingHours,
} from "../server/agent/followup-core.js";

/** A fixed Tuesday, 10:00 local — inside default working hours. */
const NOW = new Date(2026, 8, 8, 10, 0, 0);

const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);
const daysAhead = (n) => new Date(NOW.getTime() + n * 86400000);

const task = (over = {}) => ({
  id: over.id ?? "t1",
  title: over.title ?? "Draft the tier comparison",
  status: over.status ?? "pending",
  assignee_id: "assignee_id" in over ? over.assignee_id : "u1",
  deadline: "deadline" in over ? over.deadline : null,
  created_at: over.created_at ?? daysAgo(0.1),
  ...over,
});

describe("cadence", () => {
  it("maps each configured frequency to a silence budget", () => {
    assert.equal(cadenceDays("twice_daily"), 0.5);
    assert.equal(cadenceDays("daily"), 1);
    assert.equal(cadenceDays("weekly"), 7);
  });

  it("falls back to daily for anything unset or unknown", () => {
    assert.equal(cadenceDays(undefined), 1);
    assert.equal(cadenceDays("hourly"), 1);
  });
});

describe("classify", () => {
  const at = (over, opts) => classify(task(over), { now: NOW, ...opts });

  it("refuses to run without an explicit now", () => {
    assert.throws(() => classify(task()), /explicit `now`/);
  });

  it("never chases finished work", () => {
    assert.equal(at({ status: "done", created_at: daysAgo(90) }).state, "done");
  });

  it("sends a blocked task to the lead instead of nudging the assignee", () => {
    // The person already answered. Chasing them here is how a tool gets muted.
    assert.equal(at({ status: "blocked", created_at: daysAgo(30) }).state, "needs_lead");
    assert.equal(at({ status: "need_help", created_at: daysAgo(30) }).state, "needs_lead");
  });

  it("ranks a missed deadline above silence", () => {
    const r = at({ deadline: daysAgo(3), created_at: daysAgo(10) });
    assert.equal(r.state, "overdue");
  });

  it("calls it quiet once the silence budget is spent", () => {
    assert.equal(at({ created_at: daysAgo(2) }).state, "quiet");
  });

  it("holds off while the assignee is still inside their cadence", () => {
    assert.equal(at({ created_at: daysAgo(0.5) }, { frequency: "daily" }).state, "ok");
    assert.equal(at({ created_at: daysAgo(3) }, { frequency: "weekly" }).state, "ok");
  });

  it("counts from the last update, not from when the task was made", () => {
    const r = at({ created_at: daysAgo(30) }, { lastUpdateAt: daysAgo(0.2) });
    assert.equal(r.state, "ok", "a fresh update should reset the clock");
  });

  it("flags work due inside two days even when it is not quiet", () => {
    const r = at({ deadline: daysAhead(1), created_at: daysAgo(0.1) });
    assert.equal(r.state, "due_soon");
  });

  it("leaves a task with no deadline and no silence alone", () => {
    assert.equal(at({}).state, "ok");
  });

  it("reports how long the silence has run", () => {
    assert.equal(Math.round(at({ created_at: daysAgo(4) }).daysQuiet), 4);
  });
});

describe("shouldPing", () => {
  it("messages the assignee only about states they can act on", () => {
    assert.equal(shouldPing("overdue"), true);
    assert.equal(shouldPing("quiet"), true);
    assert.equal(shouldPing("due_soon"), true);
    assert.equal(shouldPing("needs_lead"), false);
    assert.equal(shouldPing("done"), false);
    assert.equal(shouldPing("ok"), false);
  });
});

describe("working hours", () => {
  const at = (h, m = 0) => new Date(2026, 8, 8, h, m);

  it("knows the inside of a normal day", () => {
    assert.equal(withinWorkingHours(at(10)), true);
    assert.equal(withinWorkingHours(at(3)), false);
    assert.equal(withinWorkingHours(at(20)), false);
  });

  it("treats the start as inclusive and the end as exclusive", () => {
    assert.equal(withinWorkingHours(at(9)), true);
    assert.equal(withinWorkingHours(at(17)), false);
  });

  it("handles a window that crosses midnight instead of never sending", () => {
    assert.equal(withinWorkingHours(at(23), "22:00", "06:00"), true);
    assert.equal(withinWorkingHours(at(2), "22:00", "06:00"), true);
    assert.equal(withinWorkingHours(at(12), "22:00", "06:00"), false);
  });

  it("sends immediately when the moment is already inside the window", () => {
    assert.equal(nextSendTime(at(10)).getHours(), 10);
  });

  it("holds a 03:00 nudge until the window opens the same morning", () => {
    const next = nextSendTime(at(3));
    assert.equal(next.getHours(), 9);
    assert.equal(next.getDate(), 8, "same day");
  });

  it("holds an evening nudge until the next morning", () => {
    const next = nextSendTime(at(20));
    assert.equal(next.getHours(), 9);
    assert.equal(next.getDate(), 9, "next day");
  });
});

describe("triage", () => {
  const users = {
    u1: { id: "u1", full_name: "Ana Diaz", ping_frequency: "daily", ai_tone: "friendly" },
    u2: { id: "u2", full_name: "Bo Feng", ping_frequency: "weekly", ai_tone: "direct" },
  };

  const sample = [
    task({ id: "late", deadline: daysAgo(2), created_at: daysAgo(9) }),
    task({ id: "silent", created_at: daysAgo(4) }),
    task({ id: "blocked", status: "blocked", created_at: daysAgo(6) }),
    task({ id: "soon", deadline: daysAhead(1), created_at: daysAgo(0.1) }),
    task({ id: "shipped", status: "done", created_at: daysAgo(20) }),
    task({ id: "patient", assignee_id: "u2", created_at: daysAgo(3) }),
    task({ id: "nobody", assignee_id: null, created_at: daysAgo(5) }),
  ];

  const buckets = triage(sample, { usersById: users, now: NOW });

  it("puts every task in exactly one bucket", () => {
    const total = Object.values(buckets).reduce((n, b) => n + b.length, 0);
    assert.equal(total, sample.length);
  });

  it("sorts by how badly each one is slipping", () => {
    assert.deepEqual(buckets.overdue.map((t) => t.task.id), ["late"]);
    assert.deepEqual(buckets.quiet.map((t) => t.task.id), ["nobody", "silent"]);
    assert.deepEqual(buckets.needs_lead.map((t) => t.task.id), ["blocked"]);
    assert.deepEqual(buckets.done.map((t) => t.task.id), ["shipped"]);
  });

  it("respects a weekly assignee's longer silence budget", () => {
    // Three days quiet is fine for Bo and not for Ana.
    assert.ok(buckets.ok.some((t) => t.task.id === "patient"));
  });

  it("surfaces unassigned work rather than skipping it", () => {
    assert.ok(buckets.quiet.some((t) => t.task.id === "nobody"));
  });

  it("never lists someone to message who has nobody on the task", () => {
    const ids = pingList(buckets).map((t) => t.task.id);
    assert.ok(!ids.includes("nobody"), "cannot nudge a task with no assignee");
    assert.ok(!ids.includes("blocked"), "blocked goes to the lead, not the assignee");
    assert.deepEqual(ids, ["late", "silent", "soon"]);
  });

  it("refuses to run without an explicit now", () => {
    assert.throws(() => triage(sample), /explicit `now`/);
  });

  describe("digest", () => {
    const d = digest(buckets);

    it("counts what the lead needs to know", () => {
      assert.equal(d.counts.total, 7);
      assert.equal(d.counts.done, 1);
      assert.equal(d.counts.open, 6);
      assert.equal(d.counts.overdue, 1);
      assert.equal(d.counts.quiet, 2);
      assert.equal(d.counts.needsLead, 1);
    });

    it("separates what only the lead can unblock", () => {
      assert.deepEqual(d.needsYou.map((t) => t.task.id), ["blocked"]);
    });

    it("leads with what is slipping worst", () => {
      assert.equal(d.slipping[0].task.id, "late");
    });

    it("names work nobody owns", () => {
      assert.deepEqual(d.unassigned.map((t) => t.task.id), ["nobody"]);
    });
  });
});

describe("the message", () => {
  const item = (state, over = {}) => ({
    state,
    task: task({ title: "Draft the tier comparison" }),
    assignee: { full_name: "Ana Diaz" },
    daysQuiet: over.daysQuiet ?? 4,
    daysToDeadline: over.daysToDeadline ?? null,
  });

  it("uses the assignee's first name", () => {
    assert.match(pingMessage(item("quiet")), /^Hey Ana —/);
  });

  it("falls back to something sayable when there is no name", () => {
    const m = pingMessage({ ...item("quiet"), assignee: null, task: task({ title: "X" }) });
    assert.match(m, /Hey there/);
  });

  it("says how long it has been quiet", () => {
    assert.match(pingMessage(item("quiet", { daysQuiet: 4 })), /No update for 4 days/);
  });

  it("says how late it is rather than asking how it is going", () => {
    const m = pingMessage(item("overdue", { daysToDeadline: -3 }));
    assert.match(m, /It was due 3 days ago/);
  });

  it("says due today rather than in 0 days", () => {
    assert.match(pingMessage(item("due_soon", { daysToDeadline: 0.2 })), /due today/);
  });

  it("gets the singular right", () => {
    assert.match(pingMessage(item("overdue", { daysToDeadline: -1 })), /due 1 day ago/);
    assert.match(pingMessage(item("quiet", { daysQuiet: 1 })), /1 day\./);
  });

  it("changes register with the configured tone", () => {
    const q = item("quiet");
    assert.match(pingMessage(q, { tone: "direct" }), /^Ana: where is/);
    assert.match(pingMessage(q, { tone: "formal" }), /^Hello Ana, could you share/);
    assert.match(pingMessage(q, { tone: "friendly" }), /^Hey Ana —/);
  });

  it("always invites the reply that unblocks the work, in that tone's words", () => {
    // The friendly register says "in the way" rather than "blocked" on purpose.
    // The assertion is about the invitation being there, not about one word.
    for (const tone of ["friendly", "direct", "formal"]) {
      assert.match(pingMessage(item("quiet"), { tone }), /block|in the way/i);
    }
  });
});

describe("daysBetween", () => {
  it("accepts dates or strings", () => {
    assert.equal(daysBetween(daysAgo(2), NOW), 2);
    assert.equal(daysBetween(daysAgo(2).toISOString(), NOW), 2);
  });
});

describe("batching", () => {
  const person = (id, over = {}) => ({ id, full_name: over.name ?? "Ana Diaz", ...over });
  const item = (id, assignee, over = {}) => ({
    state: over.state ?? "quiet",
    task: task({ id, title: over.title ?? `Task ${id}` }),
    assignee,
    daysQuiet: over.daysQuiet ?? 3,
    daysToDeadline: over.daysToDeadline ?? null,
  });

  const ana = person("u1");
  const bo = person("u2", { name: "Bo Feng" });

  it("sends one message per person, not one per task", () => {
    const out = batchByAssignee([
      item("a", ana), item("b", ana), item("c", ana), item("d", bo),
    ]);
    assert.equal(out.length, 2, "two people, two messages");
    assert.equal(out[0].items.length, 3);
    assert.equal(out[1].items.length, 1);
  });

  it("uses the single-task wording when someone owes exactly one thing", () => {
    const [out] = batchByAssignee([item("a", ana, { title: "Ship it" })]);
    assert.match(out.message, /how is "Ship it" going/);
  });

  it("names the items and counts the overflow", () => {
    const [out] = batchByAssignee(
      [1, 2, 3, 4, 5].map((n) => item(String(n), ana, { title: `T${n}` })),
      { maxListed: 3 },
    );
    assert.match(out.message, /"T1", "T2" and "T3", plus 2 more/);
    assert.match(out.message, /5 things/);
  });

  it("leads with how many are actually late", () => {
    const [out] = batchByAssignee([
      item("a", ana, { state: "overdue", daysToDeadline: -3 }),
      item("b", ana, { state: "overdue", daysToDeadline: -1 }),
      item("c", ana),
    ]);
    assert.match(out.message, /2 of them are past their deadlines\./);
  });

  it("gets the singular right when only one has slipped", () => {
    const [out] = batchByAssignee([
      item("a", ana, { state: "overdue", daysToDeadline: -3 }),
      item("b", ana),
    ]);
    assert.match(out.message, /One of them is past its deadline\./);
  });

  it("says nothing about deadlines when none have passed", () => {
    const [out] = batchByAssignee([item("a", ana), item("b", ana)]);
    assert.doesNotMatch(out.message, /deadline/);
  });

  it("drops anyone with no assignee rather than inventing a recipient", () => {
    assert.deepEqual(batchByAssignee([item("a", null), item("b", null)]), []);
  });

  it("writes each person in their own configured tone", () => {
    const direct = person("u3", { name: "Cy Ito", ai_tone: "direct" });
    const [out] = batchByAssignee([item("a", direct), item("b", direct)]);
    assert.match(out.message, /^Cy: 2 items/);
  });
});
