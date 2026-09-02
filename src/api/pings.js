import { base44 } from "./base44Client";

/** Outbound nudges to an assignee, and their replies. */

/** Pings this person has been sent but has not answered yet. */
export const listOpenFor = (assigneeId) =>
  base44.entities.Ping.filter({ assignee_id: assigneeId, status: "sent" });
