import { get, post } from "./http";

/** The configured AI workers a workspace has set up. */

export const list = (limit = 50) => get("/agents", { limit });

export const create = (agent) => post("/agents", agent);
