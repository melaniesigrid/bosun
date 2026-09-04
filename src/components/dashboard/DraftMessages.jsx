import React from "react";

/**
 * The nudges Bosun would send, one card per person.
 *
 * Nothing here sends anything. Until the scheduler exists these are drafts, and
 * the copy says so plainly — implying a message went out when it did not is the
 * worst available failure for a product whose entire promise is that it
 * followed up.
 */
export default function DraftMessages({ drafts }) {
  if (!drafts.length) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <h2
          style={{
            fontSize: 17, fontWeight: 600, color: "#3a3a3a",
            margin: 0, letterSpacing: "-0.015em",
          }}
        >
          What Bosun would send
        </h2>
        <span style={{ fontSize: 12.5, color: "#6e6e6e" }}>
          {drafts.length} message{drafts.length === 1 ? "" : "s"}
        </span>
      </div>

      <p style={{ fontSize: 12.5, color: "#6e6e6e", margin: "0 0 16px", maxWidth: "62ch" }}>
        One message per person, in the tone they are set to, held until their
        working hours. Nothing is sent yet — delivery is not built.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {drafts.map((d) => (
          <div
            key={d.assignee.id ?? d.assignee.email}
            style={{
              background: "#eeeae6", borderRadius: 14, padding: "15px 18px",
              boxShadow: "-5px -5px 10px rgba(255,250,244,0.78), 5px 5px 12px rgba(160,143,126,0.27)",
            }}
          >
            <p
              style={{
                fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase",
                color: "#6e6e6e", margin: "0 0 6px",
              }}
            >
              To {d.assignee.full_name || d.assignee.email} · {d.items.length} item
              {d.items.length === 1 ? "" : "s"}
            </p>
            <p style={{ fontSize: 14.5, color: "#3a3a3a", margin: 0, lineHeight: 1.55 }}>
              {d.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
