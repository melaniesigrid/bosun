/**
 * The board: columns, ordering, and what a drag actually changes.
 *
 * Pure, like planner-core and followup-core. A drag is easy to get wrong in
 * ways that are invisible until someone's task quietly jumps back — so the part
 * that decides "which rows changed and what are their new values" is separated
 * from the part that renders, and tested on its own.
 */

/**
 * One column per status the schema allows. `need_help` gets its own column
 * rather than being folded into Blocked: dropping a card into a column writes
 * that status, so merging two statuses into one column would silently rewrite
 * one of them.
 */
export const COLUMNS = [
  { id: "pending", label: "Pending", tone: "#8a837c" },
  { id: "in_progress", label: "In progress", tone: "#7d4fd1" },
  { id: "blocked", label: "Blocked", tone: "#c0392b" },
  { id: "need_help", label: "Needs help", tone: "#b9770e" },
  { id: "done", label: "Done", tone: "#1e8449" },
];

export const COLUMN_IDS = COLUMNS.map((c) => c.id);

const byOrder = (a, b) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
  new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0);

/**
 * Tasks grouped into columns, each sorted by sort_order.
 *
 * A task whose status is not a known column would otherwise vanish from the
 * board entirely, so anything unrecognised is put in the first column where it
 * can be seen and moved.
 */
export function toColumns(tasks = []) {
  const columns = Object.fromEntries(COLUMN_IDS.map((id) => [id, []]));
  for (const task of tasks) {
    (columns[task.status] ?? columns[COLUMN_IDS[0]]).push(task);
  }
  for (const id of COLUMN_IDS) columns[id].sort(byOrder);
  return columns;
}

/**
 * Apply a drag.
 *
 * Returns the next column state for an immediate re-render, plus `changed` —
 * the minimum set of rows whose status or sort_order actually differs. Only
 * those are written back, so dragging one card in a column of twenty does not
 * issue twenty updates.
 *
 * `sort_order` is renumbered densely from 0 within each touched column. Sparse
 * schemes drift and eventually collide; twenty writes on a rare reshuffle is
 * cheaper than a reordering bug.
 */
export function applyMove(columns, { from, to, fromIndex, toIndex }) {
  if (!columns[from] || !columns[to]) return { columns, changed: [] };

  const next = { ...columns, [from]: [...columns[from]] };
  if (to !== from) next[to] = [...columns[to]];

  const [moved] = next[from].splice(fromIndex, 1);
  if (!moved) return { columns, changed: [] };

  const landed = to === from ? moved : { ...moved, status: to };
  next[to].splice(toIndex, 0, landed);

  const changed = [];
  for (const columnId of to === from ? [from] : [from, to]) {
    next[columnId] = next[columnId].map((task, index) => {
      const updated = { ...task, sort_order: index };
      const statusChanged = updated.status !== task.status;
      if (task.sort_order !== index || statusChanged) {
        changed.push({ id: updated.id, status: updated.status, sort_order: index });
      }
      return updated;
    });
  }

  // The dragged card always counts, even when it landed on the same numbers —
  // a cross-column move with matching indices still changes its status.
  if (!changed.some((c) => c.id === landed.id)) {
    changed.push({
      id: landed.id,
      status: landed.status,
      sort_order: next[to].findIndex((t) => t.id === landed.id),
    });
  }

  return { columns: next, changed };
}

/** Counts for the column headers. */
export const countsOf = (columns) =>
  Object.fromEntries(COLUMN_IDS.map((id) => [id, columns[id]?.length ?? 0]));
