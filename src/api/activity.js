import { get, post } from "./http";

/**
 * The agent's audit log.
 *
 * Bosun acts on the user's behalf, so every action it takes has to be
 * recoverable afterwards. This module is the only way to write that record.
 */

export const listRecent = (limit = 100) => get("/activity", { limit });

export const log = (entry) => post("/activity", entry);
