import { get, post } from "./http";

/** Status reports written by an assignee, in their own words. */

export const listRecent = (limit = 500) => get("/updates", { limit });

export const listForTask = (taskId) => get("/updates", { task_id: taskId });

export const create = (update) => post("/updates", update);
