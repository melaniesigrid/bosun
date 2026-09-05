# Bosun

> [!CAUTION]
> **Spending rule: if this project spends more than US$10 in a day, stop and ask
> before doing anything else.**
>
> This binds every agent and every person, on every paid API — model calls,
> Places/Maps, email, storage, ads, build minutes. Say the running total, what it
> bought, and what the next step would cost. Then wait for a yes. Do not resume on
> your own judgment, and do not split work into smaller runs to stay under the line.
>
> - **The ceiling goes in before the loop does.** Anything that calls a paid API
>   more than once needs a hard maximum and a way to stop, written before the
>   first run — not after the first bill.
> - **A cap in the code is not a cap.** Set a budget alert and a quota ceiling in
>   the provider's own console as well. An application-level limit cannot survive
>   a bug in the application, and that is exactly when it is needed.
> - **Unmetered scripts are the hole.** A CLI, test or backfill that calls a paid
>   API without going through this project's meter spends money nothing counts.
>   If it costs money, it goes through the meter.
> - **Stop on the first sign of a runaway.** A retry storm, a loop that will not
>   terminate, a job that hangs — kill it and report. Never leave a process that
>   is spending money running while you investigate why.
>
> **Why this rule exists.** ZipQuarry spent roughly US$700 on Google Places
> between 2026-08-23 and 2026-09-02, on a product with zero users and zero
> revenue. Three failures stacked: the spend meter was written four days after
> the billing started; before that a pagination loop billed a request every 300ms
> until the process was killed by hand; and every request was on the most
> expensive Text Search tier. None of it was caught by a person, because nothing
> was watching and no console budget existed. The full postmortem is in
> `zipquarry-platform/docs/SPEND-INCIDENT-2026-08.md`.

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

The app runs on its own backend. Base44 is gone: its SDK, its Vite plugin, its
entity files and the token-in-the-URL mechanism are all out of the tree.

What does not work yet: **nothing sends a nudge.** The rule that decides who has
gone quiet is built and tested and `/briefing` shows what it would say, but
there is no scheduler and no delivery. And the two model calls behind goal
creation answer 501 until they are moved off Base44 properly, with a spend cap.

See [TODOS.md](TODOS.md) for the road to launch and the four open decisions.

## Running it

```bash
npm install
npm run seed          # a local database, seeded
npm run api           # terminal 1 — the API on :8787
npm run dev           # terminal 2 — the app, proxying /api
```

Sign in at `/login`. With no `DATABASE_URL` the API runs a real Postgres
compiled to WASM out of `.data/pglite`, so a fresh checkout needs no container
and no service.

```bash
npm test              # 128 tests — no install, backend or browser needed
npm run demo          # the follow-up rule over a seeded portfolio, rendered
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
