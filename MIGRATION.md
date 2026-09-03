# Migrating off Base44

Base44 is not a framework in this codebase. It is the entire backend. Removing
it means writing one, not swapping an import.

## What Base44 currently provides

Every call the app makes, extracted from source:

| Surface | Calls in use | Replacement |
| --- | --- | --- |
| `base44.auth` | `me`, `updateMe`, `isAuthenticated`, `logout`, `redirectToLogin` | Session cookie + magic link |
| `base44.entities.*` | `list`, `filter`, `create`, `update`, `delete`, `deleteMany` on Goal, Task, Ping, Update, Agent, AgentActivity, User | Drizzle queries against Neon Postgres |
| `base44.integrations.Core.InvokeLLM` | Clarifying questions, task generation, ping copy | Server-side Claude call — never from the browser |
| `base44.users.inviteUser` | Team page | Invite token + transactional email |
| `base44.functions.invoke` | `getMyTasks` | A route handler |

Row-level security is declared per entity in `base44/entities/*.jsonc` — most
are admin-write, all-read. Those rules are **not** documentation; they are the
only thing currently preventing a member from editing another team's goals.
They have to be reimplemented as explicit tenant scoping, not assumed.

## Order of work

**1. Build the facade first, against Base44. — DONE**
`src/api/` holds nine modules — `goals`, `tasks`, `updates`, `pings`,
`activity`, `agents`, `team`, `auth`, `planner` — that expose exactly the
operations the UI needs, each implemented by calling `base44Client`. All 69 call
sites across 17 components now go through them, and `base44Client` is imported
by `src/api/` and nowhere else. Verify with:

```bash
grep -rn "base44Client" src/ | grep -v "^src/api/"   # must return nothing
```

Steps 2-6 replace the insides of those nine modules. None of them should need to
open a component.

**2. Schema.**
Translate `base44/entities/*.jsonc` to Drizzle. Add what Base44 supplied
implicitly: a `tenant_id` on every table, real foreign keys, and `created_date` /
`updated_date`. Note the current schema denormalizes aggressively
(`goal_title`, `assignee_name`, `assignee_email` are copied onto Task) — that
was a Base44 constraint, and joins should replace it.

**3. Auth.**
Magic link, session cookie, a `users` table with the `lead` / `member` role and
the `onboarded` flag the onboarding route already reads. `AuthContext.jsx`
already models `user_not_registered` and `auth_required` as distinct states —
preserve both.

**4. Data layer.**
Route handlers behind the facade. Every query takes an explicit `tenantId`. No
query in the codebase should be able to omit it.

**5. LLM.**
`InvokeLLM` moves server-side. Both prompts already live in `src/api/planner.js`
rather than in the wizard, so this is a change to one file. Structured output with a schema and validation on
the way back — the goal wizard and task generation both parse the response into
records that get written to the database, so an unvalidated response becomes
corrupt data, not a bad string. Per-tenant token caps.

**6. Invitations and the `getMyTasks` function.** Straightforward once 3 and 4
land.

**7. Delete `@base44/sdk`, `@base44/vite-plugin`, `src/lib/app-params.js`, and
the `base44/` directory.** Ship.

## Not yet decided

- Whether pings are email, Slack, or in-app only. The `Ping` entity is
  channel-agnostic today, which is worth preserving.
- `src/lib/app-params.js` reads an access token from the URL query string and
  persists it to `localStorage`. That is a Base44 mechanism and must not be
  carried over.
