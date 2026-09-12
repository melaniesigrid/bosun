# Bosun

AI delegation and follow-up. A goal goes in; Bosun asks clarifying questions,
generates assigned tasks, and is meant to chase the people who owe you
something.

Read [TODOS.md](TODOS.md) before planning any work (it holds the launch plan,
the four open decisions, and an honest status table. [MIGRATION.md](MIGRATION.md)
holds the Base44 exit.

## Spending rule) before anything else

**If a project spends more than US$10 in a day, stop and ask before continuing.**

Every agent, every paid API: model calls, Places/Maps, email, storage, ads,
build minutes. Report the running total, what it bought, and what the next step
would cost, then wait for a yes. Do not resume on your own judgment and do not
split work into smaller runs to stay under the line.

- **The ceiling goes in before the loop does.** Anything calling a paid API more
  than once needs a hard maximum and a stop condition, written before the first
  run.
- **A cap in the code is not a cap.** The provider's own console needs a budget
  alert and a quota ceiling too: an application limit cannot survive a bug in
  the application, which is precisely when it is needed.
- **If it costs money, it goes through the meter.** A CLI, test or backfill that
  calls a paid API directly spends money nothing counts.
- **Kill a runaway before diagnosing it.** A retry storm, a loop that will not
  terminate, a hung job: stop it first, then investigate.

ZipQuarry spent ~US$700 on Google Places between 2026-08-23 and 2026-09-02 with
zero users and zero revenue: the meter was written four days after billing
started, a pagination loop billed a request every 300ms until killed by hand,
and no console budget existed. Postmortem:
`zipquarry-platform/docs/SPEND-INCIDENT-2026-08.md`.

## Start here

```bash
npm install
npm run seed      # local database with the Northbound portfolio in it
npm run api       # terminal 1 — the API on :8787
npm run dev       # terminal 2 — the app on :5173, proxying /api
```

Then sign in at `/login` as `melaniesigridab@gmail.com`. Development sign-in
needs `BOSUN_DEV_LOGIN=1` on the API.

```bash
npm test          # 128 tests, real Postgres via PGlite, no server needed
npm run lint
npm run build
```

`npm test` needs no database, no container and no credentials. Use it.

**To look at a component**, `npm run dev` and open `/preview.html`. The app
itself cannot run without a backend, so this is the only way to see UI. Add a
fixture case in `src/preview.jsx`; nothing there is imported by the app.

**To see the product working on real data**, `npm run demo`. It boots Postgres
in-process, applies the schema, seeds the Northbound portfolio and runs the
follow-up rule. Output lands in `demo/`, which is gitignored and must never be
copied into `site/`.

## The two things most likely to trip you

**Nothing sends.** Nothing writes a `Ping`; there is no scheduler. The rule that
decides who to nudge is built and tested, and `/briefing` shows the drafts, but
no message has ever left the system. Do not describe the chasing as working.

**The two model calls answer 501.** Goal creation runs a planner that is not
wired to a provider: issue #16. Everything else works end to end.

**`src/api/` is a boundary, not a folder.** Every component talks to those nine
modules, and only they know how the backend is reached. CI fails the build if a
component calls the transport itself:

```bash
grep -rn "api/http" src/ | grep -v "^src/api/"   # must return nothing
```

The whole point is that replacing the backend touches nine files and no
component. Do not reach past it for convenience.

## Layout

| Path | What it is |
| --- | --- |
| `src/pages`, `src/components` | The UI. Complete, and never run against a real backend. |
| `src/lib/followup-core.js` | The follow-up rule: who is quiet, who to nudge, what the lead sees. **Pure**, and shared by the UI and the future scheduler so they cannot disagree. |
| `src/preview.jsx`, `preview.html` | Component preview harness. Fixtures only. |
| `src/api/` | The facade. The only place that knows the backend exists. |
| `server/http/` | The API: routes and sessions. The tenant comes from the session, never a request body. |
| `server/db/` | The connection and every SQL statement. |
| `src/api/planner-core.js` | Prompts, schemas and normalisation. **Pure**, no I/O, no client, no env. Fully tested. |
| `src/api/planner.js` | Four lines of transport over planner-core. |
| `server/db/queries.js` | Every SQL read and write. Takes an explicit `tenantId`. Not yet served over HTTP. |
| `db/001_initial.sql` | The schema. Executed in CI, not eyeballed. |
| `site/` | The marketing page. Standalone HTML, no build step, deployed to GitHub Pages. Not the app. |

## Conventions

- **Pure logic goes in a `-core` module with tests.** `planner-core.js` is the
  pattern. Every bug found in the last two sessions was found by a test, not by
  reading.
- **Facade imports carry an `Api` suffix** (`taskApi`, `goalApi`). Bare names
  collide with component locals: `const { data: tasks } = useQuery(...)` will
  silently shadow `import * as tasks`.
- **Every query takes `tenantId` explicitly.** Base44's `rls` blocks do not
  survive the migration; isolation is now a column every statement filters on.
  Never resolve a tenant from a request body.
- **Async means async.** A function that reads as async at the call site must
  reject rather than throw, or `.catch()` misses it.
- One concern per commit. A change touching a component and a query is two.

## Traps

**The `@` alias lives in `vite.config.js`.** The Base44 plugin used to supply it.
Removing the plugin broke every `@/...` import at once, which is worth knowing
before touching the config.

**`AppLayout` renders one layout, chosen in JS.** It used to render all three:
desktop, tablet, mobile: hidden from each other with Tailwind classes, so every
page mounted three times and every effect and timer ran three times.

**GitHub Pages deploys `site/` only**, and only when `site/` changes. It has
never deployed the app and cannot: the app has no backend to talk to.

**Vercel is not git-connected in this workspace.** `vercel deploy --prod`
uploads the directory, not the commit. Land to `main` first.

**Entrance animations must be one-shot.** `site/index.html` scopes its reveal to
a `.preload` class a script removes. Without that, any reflow (a full-page
screenshot, a social preview render) restarts the animation and captures a
blank hero.
