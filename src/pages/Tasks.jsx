import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, LayoutGrid, List } from "lucide-react";

import * as taskApi from "@/api/tasks";
import TaskBoard from "@/components/tasks/TaskBoard";
import TaskCard from "../components/tasks/TaskCard";

const FILTERS = [
  { key: "all",         label: "All"         },
  { key: "pending",     label: "Pending"     },
  { key: "in_progress", label: "In Progress" },
  { key: "blocked",     label: "Blocked"     },
  { key: "need_help",   label: "Needs Help"  },
  { key: "done",        label: "Done"        },
];

const VIEW_KEY = "bosun.tasks.view";

export default function Tasks() {
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "board";
    } catch {
      return "board";
    }
  });
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => taskApi.list(500),
  });

  const chooseView = (next) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // A browser refusing storage should not stop the view from switching.
    }
  };

  /**
   * A drag writes only the rows board-core says actually changed.
   *
   * The board already moved the card locally, so this does not need to be
   * optimistic — but it does need to put the truth back if a write fails, or
   * the card sits somewhere the database disagrees with.
   */
  const move = useMutation({
    mutationFn: (changed) =>
      Promise.all(
        changed.map(({ id, status, sort_order }) =>
          taskApi.update(id, { status, sort_order }),
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const filteredTasks = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
  const countFor = (key) =>
    key === "all" ? tasks.length : tasks.filter((t) => t.status === key).length;

  const toggle = (target, Icon, label) => (
    <button
      onClick={() => chooseView(target)}
      aria-pressed={view === target}
      title={label}
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
        borderRadius: 9999, border: "none", cursor: "pointer",
        fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
        color: view === target ? "#3a3a3a" : "#6e6e6e",
        background: view === target ? "#ebe7e2" : "transparent",
        boxShadow: view === target
          ? "inset -3px -3px 6px rgba(255,250,244,0.68), inset 3px 3px 6px rgba(160,143,126,0.24)"
          : "none",
      }}
    >
      <Icon style={{ width: 13, height: 13, strokeWidth: 1.8 }} />
      {label}
    </button>
  );

  return (
    <div
      className="page-container"
      style={{
        padding: "24px 28px", boxSizing: "border-box", height: "100%",
        maxWidth: 1400, margin: "0 auto", width: "100%",
      }}
    >
      <div
        style={{
          marginBottom: 20, display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", gap: 16, flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 28, fontWeight: 400, color: "#3a3a3a",
              letterSpacing: "-0.01em", lineHeight: 1.2, marginBottom: 4,
            }}
          >
            Tasks
          </h1>
          <p style={{ fontSize: 14, color: "#6e6e6e" }}>
            {tasks.length} total tasks across all goals
            {view === "board" ? " · drag a card to change its status" : ""}
          </p>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {toggle("board", LayoutGrid, "Board")}
          {toggle("list", List, "List")}
        </div>
      </div>

      {view === "board" ? (
        <TaskBoard tasks={tasks} onMove={(changed) => move.mutate(changed)} />
      ) : (
        <>
          {/* Filter chips belong to the list; the board shows every column at once. */}
          <div
            style={{
              overflowX: "auto", WebkitOverflowScrolling: "touch", marginBottom: 20,
              marginLeft: -2, marginRight: -2, paddingBottom: 4,
            }}
          >
            <div style={{ display: "flex", gap: 8, padding: "2px 2px", width: "max-content" }}>
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  style={{
                    fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
                    padding: "7px 14px", borderRadius: 9999, border: "none", cursor: "pointer",
                    whiteSpace: "nowrap",
                    color: filter === key ? "#3a3a3a" : "#6e6e6e",
                    background: filter === key ? "#ebe7e2" : "transparent",
                    boxShadow: filter === key
                      ? "inset -3px -3px 6px rgba(255,250,244,0.68), inset 3px 3px 6px rgba(160,143,126,0.24)"
                      : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  {label} <span style={{ opacity: 0.6, fontSize: 11 }}>({countFor(key)})</span>
                </button>
              ))}
            </div>
          </div>

          {filteredTasks.length > 0 ? (
            <div className="flex flex-col gap-3">
              {filteredTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center" style={{ paddingTop: 80 }}>
              <CheckSquare
                style={{ width: 28, height: 28, color: "#b3b3b3", strokeWidth: 1.5, marginBottom: 14 }}
              />
              <p style={{ fontSize: 15, color: "#3a3a3a", fontWeight: 400, marginBottom: 6 }}>
                No tasks here
              </p>
              <p style={{ fontSize: 13, color: "#6e6e6e" }}>
                Nothing matches this filter.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
