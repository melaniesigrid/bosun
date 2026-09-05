import React from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { Calendar, User } from "lucide-react";

import { COLUMNS, applyMove, toColumns } from "@/lib/board-core";

/**
 * The board.
 *
 * Every decision about what a drag changes lives in board-core.js and is
 * tested there. This renders columns and reports moves; it does not work out
 * orderings itself.
 *
 * `onMove` receives only the rows that actually changed, so dragging one card
 * in a column of twenty issues two writes rather than twenty.
 */

const isOverdue = (task) =>
  task.deadline && task.status !== "done" && new Date(task.deadline) < new Date();

const shortDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function Card({ task, dragging }) {
  const overdue = isOverdue(task);

  return (
    <div
      style={{
        background: "#ebe7e2",
        borderRadius: 12,
        padding: "12px 14px",
        boxShadow: dragging
          ? "-8px -8px 16px rgba(255,250,244,0.9), 8px 8px 20px rgba(160,143,126,0.42)"
          : "inset -3px -3px 6px rgba(255,250,244,0.68), inset 3px 3px 6px rgba(160,143,126,0.24)",
        // The lift on pick-up is the only feedback that a card is held.
        transform: dragging ? "rotate(1.2deg)" : "none",
        transition: "box-shadow 0.15s ease",
      }}
    >
      <p style={{ fontSize: 13.5, color: "#3a3a3a", margin: 0, lineHeight: 1.4, fontWeight: 500 }}>
        {task.title}
      </p>

      {(task.assignee_name || task.assignee_email || task.deadline) && (
        <div
          style={{
            display: "flex", flexWrap: "wrap", gap: "4px 12px",
            marginTop: 8, fontSize: 11.5, color: "#6e6e6e",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <User style={{ width: 11, height: 11, strokeWidth: 1.8 }} />
            {task.assignee_name || task.assignee_email || "unassigned"}
          </span>
          {task.deadline && (
            <span
              style={{
                display: "flex", alignItems: "center", gap: 4,
                color: overdue ? "#c0392b" : "#6e6e6e",
              }}
            >
              <Calendar style={{ width: 11, height: 11, strokeWidth: 1.8 }} />
              {overdue ? "Overdue · " : ""}
              {shortDate(task.deadline)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Column({ column, tasks }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "0 2px" }}>
        <span
          aria-hidden="true"
          style={{ width: 7, height: 7, borderRadius: "50%", background: column.tone, flexShrink: 0 }}
        />
        <h2
          style={{
            fontSize: 12, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase",
            color: "#6e6e6e", margin: 0,
          }}
        >
          {column.label}
        </h2>
        <span style={{ fontSize: 12, color: "#8a837c", marginLeft: "auto" }}>{tasks.length}</span>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              flex: 1,
              minHeight: 120,
              borderRadius: 16,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              // The column only announces itself as a target while something is
              // actually being carried.
              boxShadow: snapshot.isDraggingOver
                ? "inset -3px -3px 7px rgba(255,250,244,0.9), inset 3px 3px 8px rgba(160,143,126,0.34)"
                : "inset -2px -2px 5px rgba(255,250,244,0.55), inset 2px 2px 5px rgba(160,143,126,0.16)",
              transition: "box-shadow 0.15s ease",
            }}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    style={dragProvided.draggableProps.style}
                  >
                    <Card task={task} dragging={dragSnapshot.isDragging} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <p style={{ fontSize: 12, color: "#a8a29b", margin: "6px 4px", fontStyle: "italic" }}>
                Nothing here.
              </p>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}

export default function TaskBoard({ tasks, onMove }) {
  // Local column state so a card lands where it was dropped immediately, rather
  // than snapping back while the write is in flight.
  const [columns, setColumns] = React.useState(() => toColumns(tasks));

  React.useEffect(() => {
    setColumns(toColumns(tasks));
  }, [tasks]);

  const handleDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return; // dropped outside any column

    const move = {
      from: source.droppableId,
      to: destination.droppableId,
      fromIndex: source.index,
      toIndex: destination.index,
    };
    if (move.from === move.to && move.fromIndex === move.toIndex) return;

    const { columns: next, changed } = applyMove(columns, move);
    if (!changed.length) return;

    setColumns(next);
    onMove?.(changed);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(210px, 1fr))`,
          gap: 14,
          alignItems: "stretch",
          // Five columns do not fit a narrow window; scrolling the board beats
          // squeezing the cards until the titles are unreadable.
          overflowX: "auto",
          paddingBottom: 8,
        }}
      >
        {COLUMNS.map((column) => (
          <Column key={column.id} column={column} tasks={columns[column.id] ?? []} />
        ))}
      </div>
    </DragDropContext>
  );
}
