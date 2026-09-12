import { get, post } from "./http";

/** Outbound nudges to an assignee, and their replies. */

/**
 * Pings sent to the signed-in person and not yet answered. The assignee is the
 * session, so this takes no argument: a caller cannot ask for someone else's.
 */
export const listOpenFor = () => get("/pings");

export const recordResponse = (id, response) => post(`/pings/${id}/response`, { response });
