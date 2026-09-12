import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Sessions, as a signed cookie.
 *
 * The cookie carries the user id and the tenant id. Nothing above trusts a
 * tenant that arrived in a request body: the only tenant a handler may act on
 * is the one in this signature. That is the whole replacement for Base44's
 * per-entity `rls` blocks.
 */

const COOKIE = "bosun_session";
const MAX_AGE_DAYS = 30;

/**
 * In development a missing secret would otherwise mean either a crash on boot
 * or, far worse, an unsigned cookie. A per-process random secret means dev just
 * works and every restart logs everyone out, which is the correct trade.
 * Production must set it, and refuses to start without it.
 */
function secret() {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  globalThis.__bosunDevSecret ??= randomBytes(32).toString("hex");
  return globalThis.__bosunDevSecret;
}

const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");

const safeEqual = (a, b) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

export function serialize({ userId, tenantId }) {
  const body = Buffer.from(JSON.stringify({ userId, tenantId, iat: Date.now() })).toString(
    "base64url",
  );
  return `${body}.${sign(body)}`;
}

export function parse(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac || !safeEqual(mac, sign(body))) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (Date.now() - claims.iat > MAX_AGE_DAYS * 86400000) return null;
    return claims;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, value) {
  const parts = [
    `${COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_DAYS * 86400}`,
  ];
  // Secure would make the cookie unusable over plain-http localhost.
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res) {
  res.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Read cookies without pulling in a parser. */
export function readCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((pair) => {
      const i = pair.indexOf("=");
      return i < 0
        ? [pair.trim(), ""]
        : [pair.slice(0, i).trim(), decodeURIComponent(pair.slice(i + 1).trim())];
    }),
  );
}

/**
 * Attaches `req.session` when the cookie is valid. Does not reject. That is
 * `requireSession`'s job, so public routes can share this.
 */
export function withSession(req, _res, next) {
  const claims = parse(readCookies(req)[COOKIE]);
  if (claims) req.session = claims;
  next();
}

export function requireSession(req, res, next) {
  if (!req.session) {
    res.status(401).json({ error: "auth_required" });
    return;
  }
  next();
}

export const SESSION_COOKIE = COOKIE;
