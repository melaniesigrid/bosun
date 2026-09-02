import { base44 } from "./base44Client";

/**
 * Session and identity.
 *
 * Nothing above this module knows who is answering these calls. Today it is
 * Base44; after the migration it is our own session cookie. See MIGRATION.md.
 */

export const me = () => base44.auth.me();

export const updateMe = (patch) => base44.auth.updateMe(patch);

export const logout = (returnTo) =>
  returnTo ? base44.auth.logout(returnTo) : base44.auth.logout();

export const redirectToLogin = (returnTo = window.location.href) =>
  base44.auth.redirectToLogin(returnTo);
