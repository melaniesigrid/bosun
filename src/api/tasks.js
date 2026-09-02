import { base44 } from "./base44Client";

/** Tasks: the unit of work that carries one assignee and one deadline. */

const RECENT = "-created_date";

export const list = (limit = 500) => base44.entities.Task.list(RECENT, limit);

export const listForGoal = (goalId) =>
  base44.entities.Task.filter({ goal_id: goalId });

/**
 * The caller's own tasks. This goes through a server function rather than a
 * filter because the scoping to "me" has to happen somewhere the client cannot
 * rewrite.
 */
export async function listMine() {
  const res = await base44.functions.invoke("getMyTasks", {});
  return res.data?.tasks ?? [];
}

export const create = (task) => base44.entities.Task.create(task);

export const createMany = (tasks) => Promise.all(tasks.map(create));

export const update = (id, patch) => base44.entities.Task.update(id, patch);

export const setStatus = (id, status) => update(id, { status });

export const remove = (id) => base44.entities.Task.delete(id);

export const removeForGoal = (goalId) =>
  base44.entities.Task.deleteMany({ goal_id: goalId });
