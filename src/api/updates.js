import { base44 } from "./base44Client";

/** Status reports written by an assignee, in their own words. */

export const listRecent = (limit = 500) =>
  base44.entities.Update.list("-created_date", limit);

export const create = (update) => base44.entities.Update.create(update);
