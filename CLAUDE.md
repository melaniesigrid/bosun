# Bosun

AI delegation and follow-up. A goal goes in; Bosun asks clarifying questions,
generates assigned tasks, and is meant to chase the people who owe you
something.

Read [TODOS.md](TODOS.md) before planning any work — it holds the launch plan,
the four open decisions, and an honest status table. [MIGRATION.md](MIGRATION.md)
holds the Base44 exit.

## Start here

```bash
npm install
npm test          # 56 tests, real Postgres via PGlite, ~10s, no server needed
npm run lint
npm run build
```

`npm test` needs no database, no container and no credentials. Use it.

## The two things most likely to trip you

**The follow-up loop does not exist.** Nothing writes a `Ping`. There is no
scheduler. Five of the eight `agent_action` values are never emitted. The app is
currently a goal-to-task generator; the landing page promises more. Do not
describe the chasing as though it works.

**`src/api/` is a boundary, not a folder.** Every component talks to those nine
modules and nothing else imports `base44Client`. CI fails the build if that
stops being true:

```bash
grep -rn "base44Client" src/ | grep -v "^src/api/"   # must return nothing
```

The whole point is that replacing the backend touches nine files and no
component. Do not reach past it for convenience.

## Layout

| Path | What it is |
| --- | --- |
| `src/pages`, `src/components` | The UI. Complete, and never run against a real backend. |
| `src/api/` | The facade. The only place Base44 is mentioned. |
| `src/api/planner-core.js` | Prompts, schemas and normalisation. **Pure** — no I/O, no client, no env. Fully tested. |
| `src/api/planner.js` | Four lines of transport over planner-core. |
| `server/db/queries.js` | Every SQL read and write. Takes an explicit `tenantId`. Not yet served over HTTP. |
| `db/001_initial.sql` | The schema. Executed in CI, not eyeballed. |
| `site/` | The marketing page. Standalone HTML, no build step, deployed to GitHub Pages. Not the app. |
| `base44/` | The original entity schemas. Reference for the migration; delete when it lands. |

## Conventions

- **Pure logic goes in a `-core` module with tests.** `planner-core.js` is the
  pattern. Every bug found in the last two sessions was found by a test, not by
  reading.
- **Facade imports carry an `Api` suffix** (`taskApi`, `goalApi`). Bare names
  collide with component locals — `const { data: tasks } = useQuery(...)` will
  silently shadow `import * as tasks`.
- **Every query takes `tenantId` explicitly.** Base44's `rls` blocks do not
  survive the migration; isolation is now a column every statement filters on.
  Never resolve a tenant from a request body.
- **Async means async.** A function that reads as async at the call site must
  reject rather than throw, or `.catch()` misses it.
- One concern per commit. A change touching a component and a query is two.

## Traps

**`src/lib/app-params.js` reads an access token from the URL query string into
`localStorage`.** That is a Base44 mechanism. It must not survive the migration.

**The build succeeds without Base44 credentials.** It only warns. A green build
does not mean the app can reach a backend — it cannot, from anywhere but
Base44 today.

**GitHub Pages deploys `site/` only**, and only when `site/` changes. It has
never deployed the app and cannot: the app has no backend to talk to.

**Vercel is not git-connected in this workspace.** `vercel deploy --prod`
uploads the directory, not the commit. Land to `main` first.

**Entrance animations must be one-shot.** `site/index.html` scopes its reveal to
a `.preload` class a script removes. Without that, any reflow — a full-page
screenshot, a social preview render — restarts the animation and captures a
blank hero.
