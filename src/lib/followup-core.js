/**
 * The follow-up rule: who has gone quiet, who should be nudged, and what the
 * lead needs to see this morning.
 *
 * This is the half of Bosun that is not a task list, and it is written the way
 * planner-core is — no database, no clock of its own, no network. `now` is
 * always passed in. That is what makes "has this been quiet for three days"
 * testable instead of something you find out in production.
 *
 * Nothing here decides to *send*. It decides what is true. Delivery is the
 * caller's job.
 *
 * It lives in src/ rather than server/ because both sides need it: the UI reads
 * it to show why a task is flagged, and the scheduler will read it to decide
 * who to message. Being pure is what lets one module serve both.
 */

const DAY = 24 * 60 * 60 * 1000;

/** How long silence is allowed to run before it is worth a nudge. */
export const CADENCE_DAYS = {
  twice_daily: 0.5,
  daily: 1,
  weekly: 7,
};

export const cadenceDays = (frequency) => CADENCE_DAYS[frequency] ?? CADENCE_DAYS.daily;

const asTime = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

export const daysBetween = (from, to) => (asTime(to) - asTime(from)) / DAY;

/**
 * A task the assignee has already reported a problem with is not silence — it
 * is an answer. Chasing someone who told you they are blocked is the fastest
 * way to get a tool switched off, so these escalate to the lead instead.
 */
const NEEDS_THE_LEAD = new Set(["blocked", "need_help"]);

/**
 * Classify one task.
 *
 * Order matters: overdue outranks quiet, because a missed deadline is already
 * known and asking "how is it going" reads as not paying attention.
 */
export function classify(task, { lastUpdateAt = null, now, frequency = "daily" } = {}) {
  if (!now) throw new Error("classify needs an explicit `now`");

  const since = lastUpdateAt ?? task.created_at;
  const daysQuiet = daysBetween(since, now);
  const daysToDeadline = task.deadline ? daysBetween(now, task.deadline) : null;

  const base = { daysQuiet, daysToDeadline, task };

  if (task.status === "done") return { ...base, state: "done" };
  if (NEEDS_THE_LEAD.has(task.status)) return { ...base, state: "needs_lead" };
  if (daysToDeadline !== null && daysToDeadline < 0) return { ...base, state: "overdue" };
  if (daysQuiet >= cadenceDays(frequency)) return { ...base, state: "quiet" };
  if (daysToDeadline !== null && daysToDeadline <= 2) return { ...base, state: "due_soon" };
  return { ...base, state: "ok" };
}

/** The states worth sending a person a message about. */
const PINGABLE = new Set(["overdue", "quiet", "due_soon"]);

export const shouldPing = (state) => PINGABLE.has(state);

// ------------------------------------------------------------ working hours

const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();

const parseClock = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
};

/**
 * Whether a moment falls inside someone's working hours.
 *
 * A window whose end is at or before its start is treated as spanning midnight,
 * so a night shift is not silently a zero-length window that never sends.
 */
export function withinWorkingHours(now, start = "09:00", end = "17:00") {
  const at = minutesOfDay(now);
  const from = parseClock(start);
  const to = parseClock(end);
  return from <= to ? at >= from && at < to : at >= from || at < to;
}

/**
 * The next moment a nudge may go out. A message that arrives at 03:00 is worse
 * than no product, so this is not optional politeness.
 */
export function nextSendTime(now, start = "09:00", end = "17:00") {
  if (withinWorkingHours(now, start, end)) return new Date(now);

  const from = parseClock(start);
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(Math.floor(from / 60), from % 60);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

// ------------------------------------------------------------------ triage


/**
 * Sort every task into what the lead should do about it.
 *
 * `updatesByTask` maps task id to that task's most recent update timestamp.
 * `usersById` supplies each assignee's cadence; a task with no assignee uses
 * the default, because unassigned work is exactly what should surface.
 */
export function triage(tasks, { updatesByTask = {}, usersById = {}, now } = {}) {
  if (!now) throw new Error("triage needs an explicit `now`");

  const buckets = { overdue: [], quiet: [], due_soon: [], needs_lead: [], ok: [], done: [] };

  for (const task of tasks) {
    const assignee = usersById[task.assignee_id];
    const result = classify(task, {
      lastUpdateAt: updatesByTask[task.id] ?? null,
      now,
      frequency: assignee?.ping_frequency,
    });
    buckets[result.state].push({ ...result, assignee: assignee ?? null });
  }

  // Worst first inside each bucket: longest silence, then soonest deadline.
  for (const key of Object.keys(buckets)) {
    buckets[key].sort(
      (a, b) =>
        b.daysQuiet - a.daysQuiet ||
        (a.daysToDeadline ?? Infinity) - (b.daysToDeadline ?? Infinity),
    );
  }

  return buckets;
}

/** Everyone who should hear from Bosun, worst first. */
export const pingList = (buckets) =>
  [...buckets.overdue, ...buckets.quiet, ...buckets.due_soon].filter((t) => t.assignee);

// ------------------------------------------------------------------ digest

/**
 * The lead's morning summary. Counts plus the handful of items that actually
 * need a decision — a digest listing everything is a second inbox, not a
 * summary.
 */
export function digest(buckets, { limit = 5 } = {}) {
  const total = Object.values(buckets).reduce((n, b) => n + b.length, 0);
  const open = total - buckets.done.length;

  return {
    counts: {
      total,
      open,
      done: buckets.done.length,
      overdue: buckets.overdue.length,
      quiet: buckets.quiet.length,
      dueSoon: buckets.due_soon.length,
      needsLead: buckets.needs_lead.length,
    },
    // What the lead has to act on personally, before anything is sent.
    needsYou: buckets.needs_lead.slice(0, limit),

    // Slipping means a person is behind. Work with nobody on it is not slipping
    // — nobody has it to slip — and listing it in both places reads as two
    // problems when it is one.
    slipping: [...buckets.overdue, ...buckets.quiet]
      .filter((t) => t.task.assignee_id)
      .slice(0, limit),

    unassigned: [...buckets.overdue, ...buckets.quiet, ...buckets.due_soon, ...buckets.ok]
      .filter((t) => !t.task.assignee_id)
      .slice(0, limit),
  };
}

// ----------------------------------------------------------------- messages

const firstName = (person) =>
  (person?.assignee_name || person?.full_name || "").trim().split(/\s+/)[0] || "there";

const whenClause = ({ state, daysToDeadline, daysQuiet }) => {
  if (state === "overdue") {
    const late = Math.max(1, Math.round(Math.abs(daysToDeadline)));
    return `It was due ${late} day${late === 1 ? "" : "s"} ago`;
  }
  if (state === "due_soon") {
    const left = Math.max(0, Math.round(daysToDeadline));
    return left === 0 ? "It is due today" : `It is due in ${left} day${left === 1 ? "" : "s"}`;
  }
  const quiet = Math.max(1, Math.round(daysQuiet));
  return `No update for ${quiet} day${quiet === 1 ? "" : "s"}`;
};

/**
 * The message body. Deterministic templates, one per configured tone.
 *
 * This is intentionally not a model call. A nudge is short, formulaic, and goes
 * out on a schedule to real colleagues — generating it costs money per send and
 * buys nothing, and a model that has a bad day here is rude to a person rather
 * than wrong in a document. The tone setting already captures the only variation
 * anyone asked for.
 */
export function pingMessage(item, { tone = "friendly" } = {}) {
  const { task, state } = item;
  const name = firstName(item.assignee ?? task);
  const when = whenClause(item);
  const title = task.title;

  if (tone === "direct") {
    return `${name}: where is "${title}"? ${when}. Reply with a status or say what is blocking it.`;
  }
  if (tone === "formal") {
    return `Hello ${name}, could you share an update on "${title}"? ${when}. If it is blocked, please say what is needed.`;
  }
  return `Hey ${name} — how is "${title}" going? ${when}. A one-line update is plenty, and say so if something is in the way.`;
}

// ------------------------------------------------------------------ batching

const listOf = (items, max) => {
  const shown = items.slice(0, max).map((i) => `"${i.task.title}"`);
  const rest = items.length - shown.length;
  const joined =
    shown.length === 1
      ? shown[0]
      : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return rest > 0 ? `${joined}, plus ${rest} more` : joined;
};

/**
 * One message per person, not one per task.
 *
 * Running the rule over a real portfolio produced thirteen separate nudges to
 * the same person in one morning. That is not following up, it is spam, and it
 * is the fastest way to have the product muted. Everything owed by one person
 * goes out as a single message.
 */
export function batchByAssignee(items, { tone, maxListed = 3 } = {}) {
  const byPerson = new Map();
  for (const item of items) {
    if (!item.assignee) continue;
    const key = item.assignee.id ?? item.assignee.email ?? item.assignee.full_name;
    if (!byPerson.has(key)) byPerson.set(key, []);
    byPerson.get(key).push(item);
  }

  return [...byPerson.values()].map((group) => {
    const assignee = group[0].assignee;
    const voice = tone ?? assignee.ai_tone ?? "friendly";
    return {
      assignee,
      items: group,
      message:
        group.length === 1
          ? pingMessage(group[0], { tone: voice })
          : batchMessage(assignee, group, { tone: voice, maxListed }),
    };
  });
}

function batchMessage(assignee, items, { tone, maxListed }) {
  const name = firstName(assignee);
  const n = items.length;
  const overdue = items.filter((i) => i.state === "overdue").length;
  const what = listOf(items, maxListed);

  // Lead with the overdue count when there is one; it is the part that matters.
  const pressure = overdue
    ? overdue === 1
      ? " One of them is past its deadline."
      : ` ${overdue} of them are past their deadlines.`
    : "";

  if (tone === "direct") {
    return `${name}: ${n} items with no recent update — ${what}.${pressure} Which are moving, and what is blocking the rest?`;
  }
  if (tone === "formal") {
    return `Hello ${name}, I have ${n} items awaiting an update: ${what}.${pressure} Could you indicate which are progressing and what is required for the others?`;
  }
  return `Hey ${name} — ${n} things I have not heard about: ${what}.${pressure} A line on each is plenty, and say if any are stuck.`;
}
