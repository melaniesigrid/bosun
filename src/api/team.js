import { base44 } from "./base44Client";

/** Workspace members. */

export const listMembers = () => base44.entities.User.list();

/**
 * Bosun's roles are "lead" and "member". The backend's are "admin" and "user".
 * The translation is kept here so no page has to know both vocabularies.
 */
export const invite = (email, role = "member") =>
  base44.users.inviteUser(email, role === "lead" ? "admin" : "user");

export const removeMember = (id) => base44.entities.User.delete(id);
