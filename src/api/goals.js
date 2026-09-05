import { del, get, patch, post } from "./http";

/** Goals: an objective, its clarifying context, and the tasks it owns. */

export const list = (limit = 50) => get("/goals", { limit });

export const getOne = (id) => get(`/goals/${id}`);
export { getOne as get };

export const create = (goal) => post("/goals", goal);

export const update = (id, body) => patch(`/goals/${id}`, body);

export const activate = (id) => update(id, { status: "active" });

export const complete = (id) => update(id, { status: "completed" });

/**
 * The tasks go with it. That is the schema's cascade now, not a second request
 * the caller has to remember.
 */
export const remove = (id) => del(`/goals/${id}`);
