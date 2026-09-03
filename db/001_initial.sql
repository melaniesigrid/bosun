-- Bosun initial schema.
--
-- Translated from base44/entities/*.jsonc. Three things change in the move, and
-- each is a correctness fix rather than a preference:
--
-- 1. Every table carries tenant_id. Base44 enforced isolation through the "rls"
--    block in each entity file; that block does not survive the migration, so
--    isolation has to become an explicit column that every query filters on.
-- 2. Real foreign keys. Base44 stored bare id strings, so nothing stopped a
--    task from pointing at a goal that no longer existed.
-- 3. The denormalised copies are gone. Task.goal_title, Task.assignee_name and
--    Task.assignee_email were a workaround for not being able to join, and they
--    went stale the moment a goal or a person was renamed.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive email

-- ------------------------------------------------------------------- enums
CREATE TYPE workspace_role AS ENUM ('lead', 'member');
CREATE TYPE goal_status    AS ENUM ('draft', 'active', 'completed', 'paused');
CREATE TYPE task_status    AS ENUM ('pending', 'in_progress', 'blocked', 'done', 'need_help');
CREATE TYPE update_status  AS ENUM ('on_track', 'blocked', 'done', 'need_help');
CREATE TYPE ping_status    AS ENUM ('sent', 'read', 'responded');
CREATE TYPE ping_frequency AS ENUM ('daily', 'twice_daily', 'weekly');
CREATE TYPE ai_tone        AS ENUM ('friendly', 'direct', 'formal');

-- Every action the agent can take, from AgentActivity.jsonc. The audit log is
-- the product promise that nothing happens off the record, so this is a closed
-- set rather than free text.
CREATE TYPE agent_action AS ENUM (
  'goal_analyzed',
  'tasks_generated',
  'task_assigned',
  'ping_sent',
  'digest_created',
  'status_checked',
  'workload_balanced',
  'clarification_asked'
);

-- ----------------------------------------------------------------- tenants
-- Base44 hung workspace_name off the user record, so every member of a
-- workspace carried a private copy of its name. It belongs here, once.
CREATE TABLE tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------- users
CREATE TABLE users (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email     citext NOT NULL,
  full_name text,
  role      workspace_role NOT NULL DEFAULT 'member',
  onboarded boolean NOT NULL DEFAULT false,

  -- The settings object from User.jsonc: ping cadence, working hours, and the
  -- tone the agent writes in. These are columns rather than a document because
  -- the agent reads them on a schedule and needs defaults it can rely on.
  ping_frequency      ping_frequency NOT NULL DEFAULT 'daily',
  working_hours_start time NOT NULL DEFAULT '09:00',
  working_hours_end   time NOT NULL DEFAULT '17:00',
  ai_tone             ai_tone NOT NULL DEFAULT 'friendly',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One account per address per workspace. Not globally unique: the same person
  -- may belong to two workspaces.
  UNIQUE (tenant_id, email)
);
CREATE INDEX users_tenant_idx ON users (tenant_id);

-- ------------------------------------------------------------------- goals
CREATE TABLE goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  owner_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  status      goal_status NOT NULL DEFAULT 'draft',
  target_date date,

  -- [{question, answer}]. Kept as a document because the wizard writes it once,
  -- reads it back whole, and never queries it field by field.
  clarifying_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_context  text NOT NULL DEFAULT '',

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goals_tenant_created_idx ON goals (tenant_id, created_at DESC);
CREATE INDEX goals_owner_idx ON goals (owner_id);

-- ------------------------------------------------------------------- tasks
CREATE TABLE tasks (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- A goal owns its tasks. The cascade lives here so the application cannot
  -- forget it; src/api/goals.js does this by hand today.
  goal_id   uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,

  title       text NOT NULL,
  description text NOT NULL DEFAULT '',

  -- Nullable on purpose: a task with nobody on it is exactly the state Bosun
  -- exists to make visible.
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,

  deadline date,
  status   task_status NOT NULL DEFAULT 'pending',

  -- numeric, not integer, because half-hour estimates are normal. The check is
  -- the database-side half of what planner-core.asHours enforces in the client:
  -- an estimate is a positive number or it is absent.
  estimated_hours numeric(5,2) CHECK (estimated_hours IS NULL OR estimated_hours > 0),

  created_by_ai boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,  -- "order" is reserved in SQL

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_goal_order_idx ON tasks (goal_id, sort_order);
CREATE INDEX tasks_assignee_status_idx ON tasks (assignee_id, status);
CREATE INDEX tasks_tenant_created_idx ON tasks (tenant_id, created_at DESC);

-- ----------------------------------------------------------------- updates
CREATE TABLE updates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  status     update_status NOT NULL,
  message    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- MyTasks reads the newest update per task; this index is that query.
CREATE INDEX updates_task_created_idx ON updates (task_id, created_at DESC);

-- ------------------------------------------------------------------- pings
CREATE TABLE pings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  assignee_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message      text NOT NULL DEFAULT '',
  status       ping_status NOT NULL DEFAULT 'sent',
  response     text,
  responded_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- A ping is answered or it is not. It cannot be both.
  CONSTRAINT ping_response_consistent CHECK (
    (status = 'responded') = (responded_at IS NOT NULL)
  )
);
-- pings.listOpenFor: one assignee, unanswered.
CREATE INDEX pings_open_idx ON pings (assignee_id, status);

-- ------------------------------------------------------------------ agents
CREATE TABLE agents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agents_tenant_idx ON agents (tenant_id);

-- ---------------------------------------------------------- agent_activity
-- The audit log. Rows are appended and read newest-first, never updated.
CREATE TABLE agent_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_type agent_action NOT NULL,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',

  -- SET NULL rather than CASCADE, deliberately: deleting a goal must not erase
  -- the record of what the agent did about it.
  related_goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,
  related_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  related_user_id uuid REFERENCES users(id) ON DELETE SET NULL,

  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_activity_tenant_created_idx ON agent_activity (tenant_id, created_at DESC);

COMMIT;
