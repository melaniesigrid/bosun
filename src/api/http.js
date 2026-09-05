/**
 * The transport for every call the app makes.
 *
 * This replaced the hosted SDK client. The nine modules beside it kept their
 * shapes, so no component changed when the backend did — which was the entire
 * point of building the facade first.
 */

const BASE = "/api";

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    // AuthContext branches on `status`; keep the name it expects.
    this.status = status;
    this.data = data;
  }
}

async function request(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      // The session is an HttpOnly cookie; nothing reads a token in JS.
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    // A dead server should not look like an auth failure, or the app will
    // bounce the user to a login page that also cannot load.
    throw new ApiError("Could not reach the Bosun API.", 0, { cause: String(cause) });
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(data?.message ?? data?.error ?? res.statusText, res.status, data);
  }
  return data;
}

const query = (params = {}) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  return pairs.length ? `?${new URLSearchParams(pairs)}` : "";
};

export const get = (path, params) => request(`${path}${query(params)}`);
export const post = (path, body) => request(path, { method: "POST", body: body ?? {} });
export const patch = (path, body) => request(path, { method: "PATCH", body: body ?? {} });
export const del = (path) => request(path, { method: "DELETE" });
