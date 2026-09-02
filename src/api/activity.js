import { base44 } from "./base44Client";

/**
 * The agent's audit log.
 *
 * Bosun acts on the user's behalf, so every action it takes has to be
 * recoverable afterwards. This module is the only way to write that record.
 */

export const listRecent = (limit = 100) =>
  base44.entities.AgentActivity.list("-created_date", limit);

export const log = (entry) => base44.entities.AgentActivity.create(entry);
