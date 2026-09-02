import { base44 } from "./base44Client";

/** The configured AI workers a workspace has set up. */

export const list = (limit = 50) =>
  base44.entities.Agent.list("-created_date", limit);

export const create = (agent) => base44.entities.Agent.create(agent);
