import { get, patch, post } from "./http";

/**
 * Session and identity.
 *
 * The session is an HttpOnly cookie set by the API. Nothing here reads or
 * stores a token — that was the Base44 mechanism, and it is deliberately gone.
 */

export const me = () => get("/me");

export const updateMe = (body) => patch("/me", body);

export async function logout(returnTo) {
  try {
    await post("/auth/logout");
  } finally {
    window.location.assign(returnTo ?? "/login");
  }
}

export const redirectToLogin = (returnTo = window.location.pathname) =>
  window.location.assign(`/login?next=${encodeURIComponent(returnTo)}`);

/** Development sign-in. The API refuses this unless BOSUN_DEV_LOGIN=1. */
export const devLogin = (email) => post("/auth/dev-login", { email });
