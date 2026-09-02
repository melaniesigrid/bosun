# Bosun

The bosun is the officer who assigns the crew's work and makes sure it actually
got done. That is the whole product.

Most project tools are a place to *write down* work. Bosun does the two jobs a
manager actually does and a board cannot: it turns a vague objective into
specific assigned tasks, and then it follows up with the people who owe you
something.

A goal goes in. Bosun asks the clarifying questions a good chief of staff would
ask, generates the tasks, assigns them, and from then on it pings assignees on
their own cadence, collects their status in their own words, and keeps a log of
every action it took on your behalf.

The question it is built to answer is not "what is everyone working on". It is
**"what did I delegate that is quietly not happening"**.

---

## Status

**Pre-migration.** The UI is complete and was built on [Base44](https://base44.com),
whose hosted backend currently provides *everything* behind the interface:
authentication, all seven entities, the LLM calls, user invitations, and the
serverless functions. Eighteen files import the Base44 client directly.

Bosun is not deployable independently until that backend is replaced. See
[MIGRATION.md](MIGRATION.md) for the plan and the current state of it.

To run against the existing Base44 backend in the meantime:

```bash
npm install
cp .env.example .env.local     # fill in the Base44 app id and base url
npm run dev
```

```bash
npm run build
npm run lint
```

## Architecture

Vite + React 18, React Router, TanStack Query, Tailwind and shadcn/ui,
`@hello-pangea/dnd` for drag ordering, Framer Motion.

| Path | Role |
| --- | --- |
| `src/pages` | One file per route: dashboard, goals, goal detail, tasks, my tasks, agent activity, team, settings, onboarding. |
| `src/components/goals` | The goal card and the creation wizard that runs the clarifying-question loop. |
| `src/components/tasks` | Task card, task form, and the status-update form assignees reply through. |
| `src/components/ui` | shadcn/ui primitives. Unmodified; safe to regenerate. |
| `src/lib/AuthContext.jsx` | Session and the authenticated/registered/anonymous state machine. |
| `src/api/base44Client.js` | **The migration boundary.** Everything backend-shaped flows through here. |
| `base44/entities` | The seven entity schemas, including row-level security rules. The source of truth for the Postgres schema that replaces them. |

## The domain

- **Goal** — an objective, its owner, a target date, and the clarifying questions
  and answers that give the AI enough context to plan against it.
- **Task** — generated or hand-written, belongs to a goal, has one assignee, a
  deadline, an estimate, and a status (`pending`, `in_progress`, `blocked`,
  `done`, `need_help`).
- **Ping** — an outbound nudge to an assignee, and their response.
- **Update** — a status report in the assignee's own words, attached to a task.
- **Agent** / **AgentActivity** — the configured AI worker and the audit log of
  every action it took: goals analyzed, tasks generated and assigned, pings
  sent, workloads balanced.

Built by [Northbound Software Studio](https://github.com/melaniesigrid/northbound-studio).
