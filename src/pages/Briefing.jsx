import React from "react";
import { useQuery } from "@tanstack/react-query";

import * as taskApi from "@/api/tasks";
import * as teamApi from "@/api/team";
import * as updateApi from "@/api/updates";
import DraftMessages from "@/components/dashboard/DraftMessages";
import TriageBoard from "@/components/dashboard/TriageBoard";
import { batchByAssignee, digest, pingList, triage } from "@/lib/followup-core";

/**
 * The morning briefing.
 *
 * What went quiet, what is late, what nobody owns, and what Bosun would say
 * about it. Every judgement comes from src/lib/followup-core.js — the same
 * module the scheduler will run — so this page and the nudges that eventually
 * go out can never disagree about what "quiet" means.
 *
 * Nothing here sends. Until the scheduler exists this is a preview of the
 * messages, and it says so rather than implying they went out.
 */
export default function Briefing() {
  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => taskApi.list(500),
  });
  const { data: recentUpdates = [] } = useQuery({
    queryKey: ["updates"],
    queryFn: () => updateApi.listRecent(500),
  });
  const { data: members = [] } = useQuery({
    queryKey: ["team"],
    queryFn: () => teamApi.listMembers(),
  });

  const now = React.useMemo(() => new Date(), []);

  const { buckets, summary, drafts } = React.useMemo(() => {
    // Newest update per task: the clock the quiet rule reads.
    const updatesByTask = {};
    for (const u of recentUpdates) {
      if (!updatesByTask[u.task_id]) updatesByTask[u.task_id] = u.created_date ?? u.created_at;
    }
    const usersById = Object.fromEntries(members.map((m) => [m.id, m]));

    const b = triage(tasks, { updatesByTask, usersById, now });
    return {
      buckets: b,
      summary: digest(b, { limit: 6 }),
      // One message per person, not one per task.
      drafts: batchByAssignee(pingList(b)),
    };
  }, [tasks, recentUpdates, members, now]);

  if (loadingTasks) {
    return (
      <div className="flex items-center justify-center" style={{ height: 240 }}>
        <div
          className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: "#b3b3b3", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "24px 28px 60px", boxSizing: "border-box",
        maxWidth: 1200, margin: "0 auto", width: "100%",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 28, fontWeight: 400, color: "#3a3a3a",
            letterSpacing: "-0.01em", lineHeight: 1.2, marginBottom: 4,
          }}
        >
          Briefing
        </h1>
        <p style={{ fontSize: 14, color: "#6e6e6e" }}>
          {now.toLocaleDateString(undefined, {
            weekday: "long", month: "long", day: "numeric",
          })}
        </p>
      </div>

      <TriageBoard buckets={buckets} summary={summary} />

      <div style={{ marginTop: 40 }}>
        <DraftMessages drafts={drafts} />
      </div>

    </div>
  );
}
