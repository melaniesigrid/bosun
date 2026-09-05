import { del, get, patch, post } from "./http";

/** Tasks: the unit of work that carries one assignee and one deadline. */

export const list = (limit = 500) => get("/tasks", { limit });

export const listForGoal = (goalId) => get("/tasks", { goal_id: goalId });

/** The caller's own tasks. Scoped to the session server-side, not by a filter. */
export const listMine = () => get("/tasks", { mine: 1 });

export const create = (task) => post("/tasks", task);

export const createMany = (tasks) => Promise.all(tasks.map(create));

export const update = (id, body) => patch(`/tasks/${id}`, body);

export const setStatus = (id, status) => update(id, { status });

export const remove = (id) => del(`/tasks/${id}`);
