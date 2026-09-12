# Bosun: the road to launch

Written 3 Sep 2026. Status lines are facts checked against the tree, not
estimates. Anything not verified says so.

---

## The finding that reorders this plan

**Nothing in the codebase ever creates a Ping.**

```
src/api/pings.js        reads them
src/pages/MyTasks.jsx   renders them
src/pages/SettingsPage  offers a "Ping Frequency" setting
                        ...nothing writes one. There is no scheduler.
```

Three of the eight `agent_action` values are ever produced: `goal_analyzed`,
`tasks_generated`, `status_checked`. The other five (`ping_sent`,
`digest_created`, `workload_balanced`, `task_assigned`, `clarification_asked`)
exist in the schema and in the UI's vocabulary, and nothing emits them.

So what exists today is a board, a briefing that knows exactly who has gone
quiet, and an activity log. The *following up*: the half the name is about:
is still not built: nothing sends. The landing page leads with the board, which
is the honest thing to lead with while that is true.

Everything below is ordered around that.

---

## Where this actually is

| Piece | State |
| --- | --- |
| UI, 10 pages | Complete and building. Never run against a real backend by us. |
| `src/api/` facade | Done. 69 call sites, CI guards the boundary. |
| `db/001_initial.sql` | 8 tables, executed against real Postgres in CI. |
| `server/db/queries.js` | Every read/write, tenant-scoped, 24 tests. |
| HTTP layer | `server/http/`: every route, tenant from the session only. |
| Auth | Session cookie. Dev sign-in works; magic links are #14. |
| The follow-up rule | Written and tested. `src/lib/followup-core.js`. |
| The Briefing page | Live at `/briefing`. Shows the triage and the drafts. |
| The board | Live at `/tasks`. Five columns, drag writes status and sort_order. |
| Base44 | **Gone.** SDK, plugin, entity files and app-params all removed. |
| The model calls | Answer 501. The last piece of the migration: #16. |
| Sending a nudge | **Still nothing sends.** No scheduler, no `Ping` rows. |
| Runs locally | Yes. `npm run seed && npm run api && npm run dev`. |
| Deployed app | Nowhere yet. It no longer needs Base44 to run. |
| Landing page | Live: <https://melaniesigrid.github.io/bosun/> |
| Tests | 128, all green, no server needed. |
| Name | Not trademark-checked. No domain owned. |
| Price | Not set. |
| Paying customers | 0. Design partners: 0. |

---

## Decisions that block work

These are yours. Everything in Phase 1+ waits on D1; the rest can be decided in
parallel.

The whole backlog is on GitHub now: five milestones, one per phase, and every
item below has an issue. <https://github.com/melaniesigrid/bosun/issues>

- [x] **D1: Server shape. Settled: a Node API beside the Vite app.** Express
      over `server/db/queries.js`, Vite proxying `/api`. The alternative was
      moving to Next.js for consistency with Shipshape, Quotefront and ReconAI;
      it was not worth a week of rewriting react-router when the UI already
      worked. Reversible: nothing in `server/` knows it is Express except
      `server/http/app.js`.
- [ ] **D2: Name.** "Bosun" is unverified. Check USPTO + CIPO, and domain
      availability, before it goes on anything harder to change than a repo.
      Budget: one hour. Do it before D3.
- [ ] **D3: Pricing posture.** ZipQuarry publishes a price and self-serves; Northbound
      publishes none and books a call. Bosun is a seat-based team SaaS, which
      argues for published + self-serve. *Recommendation: publish a price.*
- [ ] **D4: Focus.** This is the honest one. Northbound has Quotefront,
      ZipQuarry, ReconAI, Windward and Shipshape, none of them launched, and
      Bosun makes six. The binding constraint on this company is not
      engineering throughput, it is that no product has a paying customer.
      Either Bosun is the one that gets finished, or it should be parked at the
      landing page and the effort should go to whichever product is closest to
      revenue. Half-building a sixth is the expensive option.

---

## Phase 0: Decide (this week, ~2h)

- [ ] Answer D1–D4.
- [ ] If D4 says "not Bosun": stop after this phase. Change the landing page
      "In development" chip to something honest about the timeline, and leave
      the repo where it is. That is a legitimate outcome and a cheap one.
- [ ] Trademark + domain check (D2). Record the result in `MEMORY.md`.

---

## Phase 1 (Make the promise real (the follow-up loop)

This is the product. Do it *before* the backend migration if you want to
validate the idea fastest) it can be built against Base44 as it stands.

- [x] **The rule.** `server/agent/followup-core.js`. Quiet means no `Update`
      within the assignee's `ping_frequency` budget; overdue outranks quiet; a
      task the assignee reported blocked escalates to the lead instead of being
      chased. 45 tests.
- [ ] **The job that runs it** (#8). The rule is pure and takes `now`; nothing
      calls it on a schedule yet. Needs D1.
- [x] **Show it in the app** (#7). `/briefing`: Needs you, Slipping, Nobody
      owns this, each row saying why, plus the drafts Bosun would send. Uses the
      same rule the scheduler will, so they cannot drift apart.
- [x] **Respect working hours and tone.** `withinWorkingHours` and
      `nextSendTime` hold a 03:00 nudge until the window opens, and treat a
      window crossing midnight as a night shift rather than one that never
      sends. Tone drives the copy.
- [x] **Write the ping.** `pingMessage`, plus `batchByAssignee`: one message
      per person, not one per task. Running the rule over the real portfolio
      produced 13 separate nudges to one inbox, which is spam, not follow-up.
      Deterministic templates rather than a model call: a nudge is short and
      formulaic, costs money per send, and a bad generation is rude to a
      colleague.
- [ ] **Deliver it.** Channel is undecided and the `Ping` entity is deliberately
      channel-agnostic. Email is the honest default; Slack is the one people
      will ask for. Pick one for v1.
- [ ] **Collect the reply.** `Update` rows already model this and
      `StatusUpdateForm` already writes them. Wire the reply path to it.
- [ ] **Emit the missing audit actions.** `ping_sent` at minimum. The product's
      claim is that nothing happens off the record.
- [x] **The digest, as data.** `digest()` returns counts plus what needs the
      lead, what is slipping, and what nobody owns. `npm run demo` renders it.
- [ ] **The digest, delivered** (#11). Emitting `digest_created` and sending it
      needs the scheduler.
- [ ] `workload_balanced`: the landing page shows it. Either build it or cut it
      from the page.
- [x] Tests for the quiet-detection rule and the ping copy. 102 tests total.

**Gate:** you can create a goal, walk away for three days, and receive a nudge
you did not trigger. Until that works there is nothing to sell. The rule that
decides *what* to send is done; the part that *sends* is not.

See it on the real portfolio without any backend: `npm run demo`.

---

## Phase 2: Own the backend (MIGRATION.md steps 3–6)

- [x] **D1 settled.** Node API beside Vite.
- [x] **The HTTP layer** (#13). `server/http/app.js` over the query layer. The
      tenant comes from the session and nowhere else; no handler reads one from
      a body. Tested by asking for another workspace's rows by id.
- [x] **Sessions** (#14, partly). Signed HttpOnly cookie, `lead`/`member` roles
      enforced on the team routes, `user_not_registered` and `auth_required`
      kept distinct. **Magic links are still to do**: sign-in today is a
      development-only endpoint that refuses to run in production.
- [x] **Point `src/api/` at the new API** (#15). Nine files changed. No
      component did, which is the whole return on building the facade first.
- [ ] Move `InvokeLLM` server-side (#16). `planner-core.js` moves unchanged;
      only the four lines of transport in `planner.js` are rewritten. The route
      answers 501 until then, so goal creation is the one broken flow.
- [ ] Per-tenant token caps and a cost ceiling. An unbounded LLM bill on a free
      trial is a real way to lose money on a product with no revenue.
- [ ] Neon branch, migrations wired to CI, seed script.
- [x] **Delete Base44** (#17). The SDK, the Vite plugin, `base44/` and
      `src/lib/app-params.js` are all gone. `app-params.js` mattered most: it
      read an access token out of the URL query string into `localStorage`.
- [ ] Deploy. Vercel. Note the workspace trap: Vercel is not git-connected here,
      `vercel deploy --prod` ships the *directory*, so land to `main` first.

**Gate:** the app runs end to end with no Base44 credentials anywhere. **Met**,
with one hole: creating a goal calls the planner, which answers 501.

---

## Phase 3: Safe for strangers

Nothing here is optional once someone who is not you has an account.

- [ ] **Multi-tenant audit.** The query layer is scoped; the HTTP layer is where
      it will leak. Every handler, not a sample.
- [ ] **The LLM sees the roster.** `planner-core.taskPrompt` currently sends
      every team member's **name and email** to the model provider. Send ids and
      display names only, and disclose what leaves the system.
- [ ] Rate limits on auth and on anything that costs a model call.
- [ ] Secrets: nothing in the repo, everything in Vercel env, `.env.example`
      kept honest.
- [ ] Error tracking. You cannot support a product you cannot see failing.
- [ ] **Terms and privacy policy.** Bosun stores names, emails and the contents
      of people's work, and sends some of it to a model provider. PIPEDA and
      GDPR both apply the moment a stranger signs up.
- [ ] **Email law.** Pings to a team member who was invited by their own lead are
      relationship messages, not marketing, but the *invite* email and any
      launch outreach are covered by CASL and CAN-SPAM. Unsubscribe path,
      physical address, honest sender.
- [ ] Backups and a restore you have actually run once.
- [ ] Delete-my-workspace. The cascades in `001_initial.sql` already make this
      one statement; expose it.

---

## Phase 4: Go to market

- [x] **The position.** "The board that chases people." The competition (Asana,
      Linear, Motion, Height) all sell a place to put work; Bosun sells the
      board *plus* the thing none of them do. Leading with the board is also the
      honest order while nothing sends.
      **Watch the Shipshape overlap**. That product is also described as
      "kanban boards plus readiness rubrics". The boundary is now scope:
      Shipshape looks across a portfolio, Bosun looks inside one team.
- [ ] **Name the buyer.** Best guess: a lead of 3–15 people who does not have a
      project manager and is personally the bottleneck on chasing. Agencies,
      small studios, ops teams. Not enterprise, not solo.
- [ ] **Price it (D3).** Seat-based, published, self-serve. Anchor against a
      part-time coordinator, not against Asana. That framing is the whole
      pitch. Free trial with a hard token cap.
- [ ] **Five design partners before the price is final.** They use it free and
      tell you what breaks. This is the only research that counts.
- [ ] **Landing page v2.** The page is honest today but it is a brochure: there
      is no way for an interested visitor to do anything. It needs an email
      capture, and GitHub Pages cannot take a form submission. This is
      Phase 2's deploy, or a hosted form.
- [ ] Buy the domain (D2). Move the page off `github.io`.
- [ ] Screenshots and a 60-second demo of the *loop*, not the board. The demo is
      a nudge arriving and a reply landing on a task.
- [ ] Launch assets: Product Hunt, one founder post, three outbound emails to
      people who have complained about chasing their team.

---

## Phase 5: Launch

- [ ] Design partners running for two weeks with no manual intervention.
- [ ] Billing live and tested with a real card.
- [ ] Support inbox that reaches a human.
- [ ] Status page or at least an honest incident habit.
- [ ] Launch. Then talk to every single person who signs up in week one.

---

## The launch gate

Do not launch until every line is true:

- [ ] A nudge sends on a schedule, in the assignee's working hours, without
      anyone triggering it.
- [ ] No Base44 dependency anywhere in the tree.
- [ ] A second workspace cannot see the first one's data: verified by a test at
      the HTTP layer, not only at the query layer.
- [ ] Terms and privacy published, and accurate about the model provider.
- [ ] Someone who is not you completed signup with no help.
- [ ] A card has been charged and refunded successfully.
- [ ] `npm test`, `npm run lint`, `npm run build` green in CI on `main`.

---

## Deliberately not doing

- A mobile app.
- Integrations beyond the one chosen delivery channel.
- Gantt charts, time tracking, sprints, story points. The board earns its place
  because the cards are people with deadlines; those four make it a worse Asana.
- Multi-language.
- Self-hosting.

---

## Risks, named

1. **Focus (D4).** Six unlaunched products is the company's actual problem.
2. **The promise is unbuilt.** The page sells a loop that does not exist. That is
   fine while it says "In development" and dangerous the day it does not.
3. **Crowded category.** "Project management" is where products go to die. The
   wedge is narrow and has to stay narrow.
4. **Nobody may want to be nudged.** The reason this does not exist may be that
   people dislike being chased by software. Design partners answer this before
   the backend is worth building.
5. **Name risk.** Unverified, and it is on a public repo and a live page.
6. **LLM cost.** Task generation on a free trial is an unbounded bill.

---

## Seeing it without a backend

Two things exist now that did not, and both work with no database and no
credentials:

- `npm run dev`, then `/preview.html`: component fixtures through the real
  rule. The app cannot run without a backend, so this is the only way to look at
  UI. It caught two real UX bugs the first time it was pointed at anything.
- `npm run demo`: the whole rule over a seeded Northbound portfolio, rendered.
  Output stays in `demo/` and must never be copied into `site/`.

---

## Working agreements

- `main` is green. CI runs tests, lint, build, and guards the
  `src/api` boundary.
- Anything that changes a component and a query in the same commit is probably
  two commits.
- New pure logic gets a test in `test/`. Every bug found in the last three
  sessions was found by a test or by looking at the rendered output: none by
  reading the code.
- Work goes through a PR. `main` stays green.
