# Bosun

## Spending rule — before anything else

**No agent commits more than US$10 of vendor spend without asking Melanie first.**

This outranks finishing the task. An agent that stops at $10 and reports has done
the right thing; an agent that finishes the job and presents a bill has not,
however good the work is.

**What counts.** Anything metered by a third party with a card behind it —
Google Places/Maps, Anthropic, OpenAI, Gemini, Resend, Neon compute, Vercel
overages, ad spend, storage, build minutes.

**What to do.**

1. **Price the worst case out loud, before the first call.** Before any batch,
   backfill, bulk scoring run, eval sweep, or anything that loops over a corpus
   calling a vendor: compute `requests x unit price` using the vendor's real
   current per-SKU price — look it up, do not recall it — and state the number.
2. **If the worst case is over $10, stop and ask.** Say what you are doing, what
   it costs, and what it buys. Wait for a yes. Do not resume on your own
   judgment, and do not split the work into smaller runs to stay under the line.
3. **Never raise a cap, disable a guard, or route around a ledger to get
   unblocked.** Being blocked by a spend cap is the cap working.
4. **A new metered vendor needs a meter before its first call.** A vendor nothing
   meters is a vendor nothing caps.

**Four things that are not optional.**

- **The ceiling goes in before the loop does.** Anything calling a paid API more
  than once needs a hard maximum and a stop condition, written before the first
  run.
- **Cap the total, not the per-user share.** A per-user quota is not a bill: the
  bill is the sum over every user, and in development "every user" means every
  seed account, every dev auth seam, and every agent session that made one.
- **A cap in the code is not a cap.** The provider's own console needs a budget
  alert and a hard quota too. An application limit cannot survive a bug in the
  application, which is precisely when it is needed.
- **Kill a runaway before diagnosing it.** A retry storm, a loop that will not
  terminate, a hung job — stop it first, then investigate.

**Why, with the receipt.** Between 2026-08-24 and 2026-08-28 ZipQuarry billed
**US$671.66** of Google Places — 19,190 Text Search requests at the Enterprise
rate of $35/1,000 — on a $758.98 invoice, against a pre-revenue product with zero
customers and zero revenue. The meter was written four days after billing
started; a pagination loop billed a request every 300ms until it was killed by
hand; no console budget existed; the per-user quota was 400 requests/day, which
is $42/day across three dev accounts all comfortably inside their limits; and the
$200/month Google credit everyone was mentally budgeting against no longer exists
(it is per-SKU monthly free tiers now, and Text Search Enterprise gets 1,000
calls a month). Postmortem: `zipquarry-platform/docs/SPEND-INCIDENT-2026-08.md`.

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

**To look at a component**, `npm run dev` and open `/preview.html`. The app
itself cannot run without a backend, so this is the only way to see UI. Add a
fixture case in `src/preview.jsx`; nothing there is imported by the app.

**To see the product working on real data**, `npm run demo` — it boots Postgres
in-process, applies the schema, seeds the Northbound portfolio and runs the
follow-up rule. Output lands in `demo/`, which is gitignored and must never be
copied into `site/`.

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
| `src/lib/followup-core.js` | The follow-up rule: who is quiet, who to nudge, what the lead sees. **Pure**, and shared by the UI and the future scheduler so they cannot disagree. |
| `src/preview.jsx`, `preview.html` | Component preview harness. Fixtures only. |
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
