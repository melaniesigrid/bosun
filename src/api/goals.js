import { base44 } from "./base44Client";
import * as tasks from "./tasks";

/** Goals: an objective, its clarifying context, and the tasks it owns. */

const RECENT = "-created_date";

export const list = (limit = 50) => base44.entities.Goal.list(RECENT, limit);

/**
 * There is no fetch-by-id on the entity API, so callers were filtering and
 * taking the first row by hand. That belongs here rather than in five pages.
 */
export async function get(id) {
  const [goal] = await base44.entities.Goal.filter({ id });
  return goal ?? null;
}

export const create = (goal) => base44.entities.Goal.create(goal);

export const update = (id, patch) => base44.entities.Goal.update(id, patch);

export const activate = (id) => update(id, { status: "active" });

export const complete = (id) => update(id, { status: "completed" });

/**
 * A goal owns its tasks. Deleting one without the other strands rows that
 * nothing can reach, so the cascade lives here and callers cannot forget it.
 */
export async function remove(id) {
  await tasks.removeForGoal(id);
  return base44.entities.Goal.delete(id);
}
