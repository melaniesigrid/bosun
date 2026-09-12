import express from "express";

import {
  activity,
  agents,
  goals,
  pings,
  tasks,
  tenants,
  updates,
  users,
} from "../db/queries.js";
import {
  clearSessionCookie,
  requireSession,
  serialize,
  setSessionCookie,
  withSession,
} from "./session.js";

/**
 * The HTTP layer.
 *
 * One rule holds everywhere: **the tenant comes from the session and nowhere
 * else.** No handler reads a tenant id from a body, a query string or a header.
 * A caller can ask for any row id it likes; the query layer scopes it and
 * returns null, which becomes a 404. There is no code path that widens it.
 */

const ok = (res, value) => res.json(value ?? null);

const found = (res, row) =>
  row ? res.json(row) : res.status(404).json({ error: "not_found" });

/** Async handlers, with errors funnelled to the error middleware. */
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

/** The tenant for this request. The only source. */
const tenantOf = (req) => req.session.tenantId;

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.use(withSession);

  // ------------------------------------------------------------------ auth

  /**
   * Development sign-in. Given an email that already belongs to a workspace,
   * it starts a session.
   *
   * This is NOT the production flow: a real magic link mails a single-use
   * token. It is gated on BOSUN_DEV_LOGIN and refuses to exist in production,
   * because an endpoint that grants a session for a known address is an
   * account takeover if it ever ships.
   */
  app.post(
    "/api/auth/dev-login",
    h(async (req, res) => {
      if (process.env.NODE_ENV === "production" || process.env.BOSUN_DEV_LOGIN !== "1") {
        return res.status(404).json({ error: "not_found" });
      }
      const email = String(req.body?.email ?? "").trim();
      if (!email) return res.status(400).json({ error: "email_required" });

      const { rows } = await db.query(
        `SELECT id, tenant_id FROM users WHERE email = $1 ORDER BY created_at LIMIT 1`,
        [email],
      );
      const user = rows[0];
      if (!user) return res.status(403).json({ error: "user_not_registered" });

      setSessionCookie(res, serialize({ userId: user.id, tenantId: user.tenant_id }));
      const full = await users.get(db, user.tenant_id, user.id);
      return res.json(full);
    }),
  );

  app.post("/api/auth/logout", (req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // ------------------------------------------------------------------- me

  app.get(
    "/api/me",
    requireSession,
    h(async (req, res) => {
      const me = await users.get(db, tenantOf(req), req.session.userId);
      if (!me) {
        // The session is signed and valid, but the account behind it is gone.
        clearSessionCookie(res);
        return res.status(403).json({ error: "user_not_registered" });
      }
      const workspace = await tenants.get(db, tenantOf(req));
      return res.json({ ...me, workspace_name: workspace?.name ?? null });
    }),
  );

  app.patch(
    "/api/me",
    requireSession,
    h(async (req, res) => {
      const { workspace_name, ...patch } = req.body ?? {};
      // The workspace name lives on the tenant, not on the person.
      if (typeof workspace_name === "string" && workspace_name.trim()) {
        await tenants.rename(db, tenantOf(req), workspace_name.trim());
      }
      const updated = Object.keys(patch).length
        ? await users.update(db, tenantOf(req), req.session.userId, patch)
        : await users.get(db, tenantOf(req), req.session.userId);
      return found(res, updated);
    }),
  );

  // ---------------------------------------------------------------- goals

  app.get("/api/goals", requireSession, h(async (req, res) =>
    ok(res, await goals.list(db, tenantOf(req), Number(req.query.limit) || 50))));

  app.get("/api/goals/:id", requireSession, h(async (req, res) =>
    found(res, await goals.get(db, tenantOf(req), req.params.id))));

  app.post("/api/goals", requireSession, h(async (req, res) =>
    res.status(201).json(await goals.create(db, tenantOf(req), req.body ?? {}))));

  app.patch("/api/goals/:id", requireSession, h(async (req, res) =>
    found(res, await goals.update(db, tenantOf(req), req.params.id, req.body ?? {}))));

  app.delete("/api/goals/:id", requireSession, h(async (req, res) =>
    found(res, await goals.remove(db, tenantOf(req), req.params.id))));

  // ---------------------------------------------------------------- tasks

  app.get(
    "/api/tasks",
    requireSession,
    h(async (req, res) => {
      const tenant = tenantOf(req);
      if (req.query.goal_id) return ok(res, await tasks.listForGoal(db, tenant, req.query.goal_id));
      if (req.query.mine === "1") {
        return ok(res, await tasks.listForAssignee(db, tenant, req.session.userId));
      }
      return ok(res, await tasks.list(db, tenant, Number(req.query.limit) || 500));
    }),
  );

  app.post("/api/tasks", requireSession, h(async (req, res) =>
    res.status(201).json(await tasks.create(db, tenantOf(req), req.body ?? {}))));

  app.patch("/api/tasks/:id", requireSession, h(async (req, res) =>
    found(res, await tasks.update(db, tenantOf(req), req.params.id, req.body ?? {}))));

  app.delete("/api/tasks/:id", requireSession, h(async (req, res) =>
    found(res, await tasks.remove(db, tenantOf(req), req.params.id))));

  // -------------------------------------------------------------- updates

  app.get("/api/updates", requireSession, h(async (req, res) => {
    const tenant = tenantOf(req);
    if (req.query.task_id) return ok(res, await updates.listForTask(db, tenant, req.query.task_id));
    return ok(res, await updates.listRecent(db, tenant, Number(req.query.limit) || 500));
  }));

  app.post("/api/updates", requireSession, h(async (req, res) =>
    res.status(201).json(
      await updates.create(db, tenantOf(req), { ...req.body, user_id: req.session.userId }),
    )));

  // ---------------------------------------------------------------- pings

  app.get("/api/pings", requireSession, h(async (req, res) =>
    ok(res, await pings.listOpenFor(db, tenantOf(req), req.session.userId))));

  app.post("/api/pings/:id/response", requireSession, h(async (req, res) =>
    found(res, await pings.recordResponse(db, tenantOf(req), req.params.id, req.body?.response ?? ""))));

  // ------------------------------------------------------------- activity

  app.get("/api/activity", requireSession, h(async (req, res) =>
    ok(res, await activity.listRecent(db, tenantOf(req), Number(req.query.limit) || 100))));

  app.post("/api/activity", requireSession, h(async (req, res) =>
    res.status(201).json(await activity.log(db, tenantOf(req), req.body ?? {}))));

  // --------------------------------------------------------------- agents

  app.get("/api/agents", requireSession, h(async (req, res) =>
    ok(res, await agents.list(db, tenantOf(req), Number(req.query.limit) || 50))));

  app.post("/api/agents", requireSession, h(async (req, res) =>
    res.status(201).json(await agents.create(db, tenantOf(req), req.body ?? {}))));

  // ----------------------------------------------------------------- team

  app.get("/api/team", requireSession, h(async (req, res) =>
    ok(res, await users.listMembers(db, tenantOf(req)))));

  app.post(
    "/api/team",
    requireSession,
    h(async (req, res) => {
      const me = await users.get(db, tenantOf(req), req.session.userId);
      if (me?.role !== "lead") return res.status(403).json({ error: "lead_required" });

      const email = String(req.body?.email ?? "").trim();
      if (!email) return res.status(400).json({ error: "email_required" });

      const existing = await users.findByEmail(db, tenantOf(req), email);
      if (existing) return res.status(200).json(existing);

      const created = await users.create(db, tenantOf(req), {
        email,
        role: req.body?.role === "lead" ? "lead" : "member",
      });
      await activity.log(db, tenantOf(req), {
        action_type: "task_assigned",
        title: `Invited ${email}`,
        description: "Added to the workspace.",
        related_user_id: created.id,
      });
      return res.status(201).json(created);
    }),
  );

  app.delete(
    "/api/team/:id",
    requireSession,
    h(async (req, res) => {
      const me = await users.get(db, tenantOf(req), req.session.userId);
      if (me?.role !== "lead") return res.status(403).json({ error: "lead_required" });
      if (req.params.id === req.session.userId) {
        return res.status(400).json({ error: "cannot_remove_self" });
      }
      return found(res, await users.remove(db, tenantOf(req), req.params.id));
    }),
  );

  // ------------------------------------------------------------- planning

  /**
   * The two model calls. Not wired to a provider yet: this is the one place
   * MIGRATION.md step 5 still has to land, and answering 501 is better than
   * pretending.
   */
  app.post("/api/plan/:kind", requireSession, (_req, res) =>
    res.status(501).json({
      error: "not_implemented",
      message:
        "Planning still runs through Base44. Moving it here is issue #16. It needs a model key and a per-tenant spend cap.",
    }));

  // ---------------------------------------------------------------- misc

  app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));

  // eslint-disable-next-line no-unused-vars -- express identifies error middleware by arity
  app.use((err, _req, res, _next) => {
    // Validation errors from the query layer are the caller's fault, not ours.
    const bad = /unknown column|empty patch/.test(err?.message ?? "");
    if (!bad) console.error(err);
    res.status(bad ? 400 : 500).json({ error: bad ? "bad_request" : "server_error", message: err?.message });
  });

  return app;
}
