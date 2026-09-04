import React from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Clock, HelpCircle, UserX } from "lucide-react";

/**
 * What the lead should do about the portfolio this morning.
 *
 * Presentational only — every judgement comes from src/lib/followup-core.js, so
 * the rule that decides "quiet" is the same one the scheduler will use to decide
 * who to message. Nothing here re-derives it.
 */

const TONE = {
  overdue:    { color: "#c0392b", label: "Overdue" },
  quiet:      { color: "#b9770e", label: "Gone quiet" },
  due_soon:   { color: "#665f57", label: "Due soon" },
  needs_lead: { color: "#7d4fd1", label: "Needs you" },
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const silenceOf = (item) => {
  const d = Math.round(item.daysQuiet);
  return d < 1 ? "today" : `${plural(d, "day")} silent`;
};

const lateness = (item) => {
  if (item.daysToDeadline === null) return null;
  const d = Math.round(item.daysToDeadline);
  if (d < 0) return `${plural(Math.abs(d), "day")} late`;
  if (d === 0) return "due today";
  return `due in ${plural(d, "day")}`;
};

function Row({ item, showState = true, showAssignee = true }) {
  const tone = TONE[item.state] ?? TONE.due_soon;
  const late = lateness(item);

  return (
    <li
      style={{
        display: "flex", gap: 14, alignItems: "flex-start",
        padding: "12px 14px", borderRadius: 12,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          marginTop: 7, background: tone.color,
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <Link
          to={item.task.goal_id ? `/goals/${item.task.goal_id}` : "/tasks"}
          style={{
            fontSize: 14.5, color: "#3a3a3a", fontWeight: 500,
            textDecoration: "none", display: "block",
          }}
        >
          {item.task.title}
        </Link>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#6e6e6e" }}>
          {/* Always say why. A flag with no reason is just a colour. The state
              and the assignee are dropped where the panel heading already says
              them — repeating it reads as filler. */}
          {showState && (
            <>
              <span style={{ color: tone.color, fontWeight: 500 }}>{tone.label}</span>
              {" · "}
            </>
          )}
          {showAssignee && (
            <>
              {item.assignee?.full_name || item.assignee?.email || "unassigned"}
              {" · "}
            </>
          )}
          {late ? `${late} · ` : ""}
          {silenceOf(item)}
        </p>
      </div>
    </li>
  );
}

function Panel({ icon: Icon, title, blurb, items, empty, limit = 4, showState = true, showAssignee = true }) {
  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;

  return (
    <section
      style={{
        background: "#eeeae6", borderRadius: 18, padding: "20px 18px 14px",
        boxShadow: "-5px -5px 10px rgba(255,250,244,0.78), 5px 5px 12px rgba(160,143,126,0.27)",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 3 }}>
        <Icon style={{ width: 15, height: 15, color: "#6e6e6e", strokeWidth: 1.8 }} />
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#3a3a3a", margin: 0, letterSpacing: "-0.01em" }}>
          {title}
        </h3>
        {items.length > 0 && (
          <span style={{ fontSize: 12, color: "#6e6e6e", marginLeft: "auto" }}>{items.length}</span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: "#6e6e6e", margin: "0 0 12px", lineHeight: 1.5 }}>{blurb}</p>

      {shown.length === 0 ? (
        // An empty panel here is good news, and should read as good news rather
        // than as a screen that failed to load.
        <p style={{ fontSize: 13, color: "#8a837c", margin: "4px 0 10px", fontStyle: "italic" }}>
          {empty}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {shown.map((item) => (
            <Row key={item.task.id} item={item} showState={showState} showAssignee={showAssignee} />
          ))}
        </ul>
      )}

      {rest > 0 && (
        <p style={{ fontSize: 12, color: "#6e6e6e", margin: "6px 0 0", padding: "0 14px" }}>
          and {rest} more
        </p>
      )}
    </section>
  );
}

export default function TriageBoard({ buckets, summary }) {
  const nothingWrong =
    summary.needsYou.length === 0 &&
    summary.slipping.length === 0 &&
    summary.unassigned.length === 0;

  if (nothingWrong) {
    return (
      <div
        style={{
          background: "#eeeae6", borderRadius: 18, padding: "26px 22px", textAlign: "center",
          boxShadow: "-5px -5px 10px rgba(255,250,244,0.78), 5px 5px 12px rgba(160,143,126,0.27)",
        }}
      >
        <p style={{ fontSize: 15, color: "#3a3a3a", margin: "0 0 4px", fontWeight: 500 }}>
          Nothing is slipping.
        </p>
        <p style={{ fontSize: 13, color: "#6e6e6e", margin: 0 }}>
          Every task has someone on it and a recent update. Bosun has nothing to chase.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: "#3a3a3a", margin: 0, letterSpacing: "-0.015em" }}>
          What needs you
        </h2>
        <span style={{ fontSize: 12.5, color: "#6e6e6e" }}>
          {plural(summary.counts.open, "open task")}
          {summary.counts.overdue > 0 ? ` · ${summary.counts.overdue} overdue` : ""}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(268px, 1fr))",
          gap: 16,
        }}
      >
        <Panel
          icon={HelpCircle}
          title="Needs you"
          blurb="Someone said they are stuck. Bosun does not chase these — you unblock them."
          items={summary.needsYou}
          empty="Nobody is waiting on you."
          showState={false}
        />
        <Panel
          icon={AlertCircle}
          title="Slipping"
          blurb="Overdue, or silent past the cadence. Worst first."
          items={summary.slipping}
          empty="Everything has moved recently."
        />
        <Panel
          icon={UserX}
          title="Nobody owns this"
          blurb="No assignee. It cannot go quiet, because it never started."
          items={summary.unassigned}
          empty="Every task has a name on it."
          showAssignee={false}
        />
      </div>

      {buckets.due_soon.length > 0 && (
        <p style={{ fontSize: 12.5, color: "#6e6e6e", margin: "14px 2px 0", display: "flex", alignItems: "center", gap: 7 }}>
          <Clock style={{ width: 13, height: 13, strokeWidth: 1.8 }} />
          {plural(buckets.due_soon.length, "task")} due in the next two days and moving fine.
        </p>
      )}
    </div>
  );
}
