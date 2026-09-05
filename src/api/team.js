import { del, get, post } from "./http";

/** Workspace members. */

export const listMembers = () => get("/team");

/**
 * Bosun's roles are "lead" and "member" throughout now — the admin/user
 * translation the Base44 client needed is gone with it.
 */
export const invite = (email, role = "member") => post("/team", { email, role });

export const removeMember = (id) => del(`/team/${id}`);
