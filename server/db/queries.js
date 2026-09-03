/**
 * Every read and write against the Bosun schema.
 *
 * Two rules hold everywhere in this file, and they are the whole point of it:
 *
 * 1. Every function takes an explicit `tenantId` as its second argument, and
 *    every statement filters or writes on it. Base44 enforced isolation with
 *    the `rls` block in each entity file. That block does not survive the
 *    migration, so isolation has to be something the signature forces a caller
 *    to supply and cannot express without.
 *
 * 2. Nothing is interpolated into SQL except column names drawn from the
 *    hard-coded allow-lists below. Values are always parameters.
 *
 * Every function here is async, including the ones that fail validation before
 * touching the database — a function that looks async at the call site must
 * reject rather than throw, or `.catch()` on it misses the error.
 *
 * `db` is anything with `query(text, params) -> { rows }`. PGlite satisfies it
 * in the tests; node-postgres and the Neon serverless driver satisfy it in
 * production. Keeping that surface to one method is what lets the tests run a
 * real Postgres without a server.
 */

// --------------------------------------------------------------- helpers

const rows = async (db, text, params) => (await db.query(text, params)).rows;

const first = async (db, text, params) => {
  const [row] = await rows(db, text, params);
  return row ?? null;
};

/**
 * Build a tenant-scoped UPDATE from a patch object.
 *
 * `allowed` is a hard-coded list per table. A column outside it is not silently
 * ignored — it throws, because a caller sending an unknown field is a bug, and
 * quietly dropping it is how a write appears to succeed while doing nothing.
 */
function buildUpdate(table, allowed, tenantId, id, patch) {
  const keys = Object.keys(patch);
  const unknown = keys.filter((k) => !allowed.includes(k));
  if (unknown.length) {
    throw new Error(`${table}: cannot update unknown column(s): ${unknown.join(", ")}`);
  }
  if (!keys.length) throw new Error(`${table}: update called with an empty patch`);

  // $1 is tenant, $2 is id, values start at $3.
  const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
  return {
    text: `UPDATE ${table} SET ${sets}, updated_at = now()
           WHERE tenant_id = $1 AND id = $2
           RETURNING *`,
    params: [tenantId, id, ...keys.map((k) => patch[k])],
  };
}

/** Build a tenant-scoped INSERT from a data object, same allow-list rule. */
function buildInsert(table, allowed, tenantId, data) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  const unknown = keys.filter((k) => !allowed.includes(k));
  if (unknown.length) {
    throw new Error(`${table}: cannot insert unknown column(s): ${unknown.join(", ")}`);
  }

  const cols = ["tenant_id", ...keys];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  return {
    text: `INSERT INTO ${table} (${cols.join(", ")})
           VALUES (${placeholders})
           RETURNING *`,
    params: [tenantId, ...keys.map((k) => data[k])],
  };
}

// ----------------------------------------------------------------- goals

const GOAL_COLUMNS = [
  "title",
  "description",
  "owner_id",
  "status",
  "target_date",
  "clarifying_questions",
  "ai_context",
];

export const goals = {
  list: (db, tenantId, limit = 50) =>
    rows(
      db,
      `SELECT * FROM goals WHERE tenant_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit],
    ),

  get: (db, tenantId, id) =>
    first(db, `SELECT * FROM goals WHERE tenant_id = $1 AND id = $2`, [tenantId, id]),

  create: async (db, tenantId, data) => {
    const { text, params } = buildInsert("goals", GOAL_COLUMNS, tenantId, data);
    return first(db, text, params);
  },

  update: async (db, tenantId, id, patch) => {
    const { text, params } = buildUpdate("goals", GOAL_COLUMNS, tenantId, id, patch);
    return first(db, text, params);
  },

  /**
   * The tasks go with it, but that is the schema's cascade, not a second
   * statement here. Returns the row that was removed, or null if the id
   * belonged to another tenant.
   */
  remove: (db, tenantId, id) =>
    first(db, `DELETE FROM goals WHERE tenant_id = $1 AND id = $2 RETURNING *`, [
      tenantId,
      id,
    ]),
};

// ----------------------------------------------------------------- tasks

const TASK_COLUMNS = [
  "goal_id",
  "title",
  "description",
  "assignee_id",
  "deadline",
  "status",
  "estimated_hours",
  "created_by_ai",
  "sort_order",
];

/**
 * Tasks are read with the goal title and the assignee joined on rather than
 * copied onto the row. The denormalised columns in the Base44 schema are what
 * this join replaces.
 */
const TASK_SELECT = `
  SELECT t.*,
         g.title      AS goal_title,
         u.full_name  AS assignee_name,
         u.email      AS assignee_email
    FROM tasks t
    JOIN goals g ON g.id = t.goal_id
    LEFT JOIN users u ON u.id = t.assignee_id`;

export const tasks = {
  list: (db, tenantId, limit = 500) =>
    rows(
      db,
      `${TASK_SELECT} WHERE t.tenant_id = $1
       ORDER BY t.created_at DESC LIMIT $2`,
      [tenantId, limit],
    ),

  listForGoal: (db, tenantId, goalId) =>
    rows(
      db,
      `${TASK_SELECT} WHERE t.tenant_id = $1 AND t.goal_id = $2
       ORDER BY t.sort_order, t.created_at`,
      [tenantId, goalId],
    ),

  /** The caller's own tasks — what the getMyTasks function returned. */
  listForAssignee: (db, tenantId, assigneeId) =>
    rows(
      db,
      `${TASK_SELECT} WHERE t.tenant_id = $1 AND t.assignee_id = $2
       ORDER BY t.deadline NULLS LAST, t.created_at DESC`,
      [tenantId, assigneeId],
    ),

  get: (db, tenantId, id) =>
    first(db, `${TASK_SELECT} WHERE t.tenant_id = $1 AND t.id = $2`, [tenantId, id]),

  create: async (db, tenantId, data) => {
    const { text, params } = buildInsert("tasks", TASK_COLUMNS, tenantId, data);
    return first(db, text, params);
  },

  update: async (db, tenantId, id, patch) => {
    const { text, params } = buildUpdate("tasks", TASK_COLUMNS, tenantId, id, patch);
    return first(db, text, params);
  },

  remove: (db, tenantId, id) =>
    first(db, `DELETE FROM tasks WHERE tenant_id = $1 AND id = $2 RETURNING *`, [
      tenantId,
      id,
    ]),
};

// --------------------------------------------------------------- updates

export const updates = {
  listForTask: (db, tenantId, taskId, limit = 100) =>
    rows(
      db,
      `SELECT * FROM updates WHERE tenant_id = $1 AND task_id = $2
       ORDER BY created_at DESC LIMIT $3`,
      [tenantId, taskId, limit],
    ),

  listRecent: (db, tenantId, limit = 500) =>
    rows(
      db,
      `SELECT * FROM updates WHERE tenant_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit],
    ),

  create: (db, tenantId, { task_id, user_id, status, message = "" }) =>
    first(
      db,
      `INSERT INTO updates (tenant_id, task_id, user_id, status, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, task_id, user_id, status, message],
    ),
};

// ----------------------------------------------------------------- pings

export const pings = {
  /** One assignee, still unanswered. */
  listOpenFor: (db, tenantId, assigneeId) =>
    rows(
      db,
      `SELECT * FROM pings
        WHERE tenant_id = $1 AND assignee_id = $2 AND status <> 'responded'
        ORDER BY created_at DESC`,
      [tenantId, assigneeId],
    ),

  create: (db, tenantId, { task_id, assignee_id, message = "" }) =>
    first(
      db,
      `INSERT INTO pings (tenant_id, task_id, assignee_id, message)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, task_id, assignee_id, message],
    ),

  /**
   * Status and timestamp move together. The schema has a CHECK that refuses one
   * without the other, so they are set in a single statement.
   */
  recordResponse: (db, tenantId, id, response) =>
    first(
      db,
      `UPDATE pings
          SET status = 'responded', response = $3, responded_at = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
      [tenantId, id, response],
    ),
};

// -------------------------------------------------------------- activity

export const activity = {
  listRecent: (db, tenantId, limit = 100) =>
    rows(
      db,
      `SELECT * FROM agent_activity WHERE tenant_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit],
    ),

  log: (
    db,
    tenantId,
    {
      action_type,
      title,
      description = "",
      related_goal_id = null,
      related_task_id = null,
      related_user_id = null,
      metadata = {},
    },
  ) =>
    first(
      db,
      `INSERT INTO agent_activity
         (tenant_id, action_type, title, description,
          related_goal_id, related_task_id, related_user_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantId,
        action_type,
        title,
        description,
        related_goal_id,
        related_task_id,
        related_user_id,
        JSON.stringify(metadata),
      ],
    ),
};

// ---------------------------------------------------------------- agents

export const agents = {
  list: (db, tenantId, limit = 50) =>
    rows(
      db,
      `SELECT * FROM agents WHERE tenant_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit],
    ),

  create: (db, tenantId, { name, description = "", instructions = "" }) =>
    first(
      db,
      `INSERT INTO agents (tenant_id, name, description, instructions)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, name, description, instructions],
    ),
};

// ----------------------------------------------------------------- users

const USER_COLUMNS = [
  "full_name",
  "role",
  "onboarded",
  "ping_frequency",
  "working_hours_start",
  "working_hours_end",
  "ai_tone",
];

export const users = {
  listMembers: (db, tenantId) =>
    rows(db, `SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at`, [tenantId]),

  get: (db, tenantId, id) =>
    first(db, `SELECT * FROM users WHERE tenant_id = $1 AND id = $2`, [tenantId, id]),

  /** citext makes this case-insensitive; the lookup does not have to normalise. */
  findByEmail: (db, tenantId, email) =>
    first(db, `SELECT * FROM users WHERE tenant_id = $1 AND email = $2`, [tenantId, email]),

  create: (db, tenantId, { email, full_name = null, role = "member" }) =>
    first(
      db,
      `INSERT INTO users (tenant_id, email, full_name, role)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, email, full_name, role],
    ),

  update: async (db, tenantId, id, patch) => {
    const { text, params } = buildUpdate("users", USER_COLUMNS, tenantId, id, patch);
    return first(db, text, params);
  },

  remove: (db, tenantId, id) =>
    first(db, `DELETE FROM users WHERE tenant_id = $1 AND id = $2 RETURNING *`, [
      tenantId,
      id,
    ]),
};

/** Workspaces. Not tenant-scoped, because this is the tenant. */
export const tenants = {
  create: (db, name) =>
    first(db, `INSERT INTO tenants (name) VALUES ($1) RETURNING *`, [name]),

  get: (db, id) => first(db, `SELECT * FROM tenants WHERE id = $1`, [id]),

  rename: (db, id, name) =>
    first(
      db,
      `UPDATE tenants SET name = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, name],
    ),
};
