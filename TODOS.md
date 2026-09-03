# Bosun — the road to launch

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

Three of the eight `agent_action` values are ever produced — `goal_analyzed`,
`tasks_generated`, `status_checked`. The other five (`ping_sent`,
`digest_created`, `workload_balanced`, `task_assigned`, `clarification_asked`)
exist in the schema and in the UI's vocabulary, and nothing emits them.

So what exists today is a goal-to-task generator with a nice activity log. The
*following up* — the half that is not Asana, the half the name is about — is
not built. The live landing page already promises it: "It follows up without
you." That sentence is currently marketing ahead of the product, and it is the
first thing to either make true or take down.

Everything below is ordered around that.

---

## Where this actually is

| Piece | State |
| --- | --- |
| UI, 10 pages | Complete and building. Never run against a real backend by us. |
| `src/api/` facade | Done. 69 call sites, CI guards the boundary. |
| `db/001_initial.sql` | 8 tables, executed against real Postgres in CI. |
| `server/db/queries.js` | Every read/write, tenant-scoped, 24 tests. |
| HTTP layer | **Does not exist.** |
| Auth | **Does not exist.** Base44 supplies it today. |
| The follow-up loop | **Does not exist.** See above. |
| Deployed app | Nowhere. Base44 is still the only thing that can run it. |
| Landing page | Live: <https://melaniesigrid.github.io/bosun/> |
| Tests | 56, all green, ~10s, no server needed. |
| Name | Not trademark-checked. No domain owned. |
| Price | Not set. |
| Paying customers | 0. Design partners: 0. |

---

## Decisions that block work

These are yours. Everything in Phase 1+ waits on D1; the rest can be decided in
parallel.

- [ ] **D1 — Server shape.** Node API beside the Vite app (ZipQuarry's pattern;
      keeps all 4,000 lines of routing untouched) vs. move to Next.js
      (Shipshape/Quotefront/ReconAI's pattern; means rewriting react-router).
      *Recommendation: Node API.* The UI is finished and working; rewriting its
      routing buys consistency with three siblings and costs a week that should
      go into the follow-up loop. `server/db/queries.js` was deliberately
      written to work under either.
- [ ] **D2 — Name.** "Bosun" is unverified. Check USPTO + CIPO, and domain
      availability, before it goes on anything harder to change than a repo.
      Budget: one hour. Do it before D3.
- [ ] **D3 — Pricing posture.** ZipQuarry publishes a price and self-serves; Northbound
      publishes none and books a call. Bosun is a seat-based team SaaS, which
      argues for published + self-serve. *Recommendation: publish a price.*
- [ ] **D4 — Focus.** This is the honest one. Northbound has Quotefront,
      ZipQuarry, ReconAI, Windward and Shipshape, none of them launched, and
      Bosun makes six. The binding constraint on this company is not
      engineering throughput, it is that no product has a paying customer.
      Either Bosun is the one that gets finished, or it should be parked at the
      landing page and the effort should go to whichever product is closest to
      revenue. Half-building a sixth is the expensive option.

---

## Phase 0 — Decide (this week, ~2h)

- [ ] Answer D1–D4.
- [ ] If D4 says "not Bosun": stop after this phase. Change the landing page
      "In development" chip to something honest about the timeline, and leave
      the repo where it is. That is a legitimate outcome and a cheap one.
- [ ] Trademark + domain check (D2). Record the result in `MEMORY.md`.

---

## Phase 1 — Make the promise real (the follow-up loop)

This is the product. Do it *before* the backend migration if you want to
validate the idea fastest — it can be built against Base44 as it stands.

- [ ] **The scheduler.** A job that wakes on a cadence, finds tasks that are
      quiet, and decides who to nudge. "Quiet" needs a definition: no `Update`
      on a task within N days of its deadline, where N comes from the
      assignee's `ping_frequency`. Write that rule down before coding it.
- [ ] **Respect working hours and tone.** `users.working_hours_start/end` and
      `ai_tone` already exist in the schema and in Settings, and nothing reads
      them. A nudge that arrives at 03:00 is worse than no product.
- [ ] **Write the ping.** A `planner-core`-style pure function: task + history +
      tone in, message out. Pure, so it is testable the way the planner is.
- [ ] **Deliver it.** Channel is undecided and the `Ping` entity is deliberately
      channel-agnostic. Email is the honest default; Slack is the one people
      will ask for. Pick one for v1.
- [ ] **Collect the reply.** `Update` rows already model this and
      `StatusUpdateForm` already writes them. Wire the reply path to it.
- [ ] **Emit the missing audit actions.** `ping_sent` at minimum. The product's
      claim is that nothing happens off the record.
- [ ] **The digest.** `digest_created` — the lead's morning summary of what
      moved and what went quiet. This is the artifact that makes someone open
      the app daily. Arguably the real retention hook.
- [ ] `workload_balanced` — the landing page shows it. Either build it or cut it
      from the page.
- [ ] Tests for the quiet-detection rule and the ping copy, in the pure style of
      `test/planner-core.test.js`.

**Gate:** you can create a goal, walk away for three days, and receive a nudge
you did not trigger. Until that works there is nothing to sell.

---

## Phase 2 — Own the backend (MIGRATION.md steps 3–6)

- [ ] **D1 first.** Nothing here starts until the server shape is chosen.
- [ ] Stand up the HTTP layer over `server/db/queries.js`. Every handler
      resolves `tenantId` from the session and passes it explicitly; no handler
      may read it from the request body.
- [ ] Auth: magic link, session cookie, the `lead`/`member` roles and the
      `onboarded` flag the onboarding route already reads. `AuthContext.jsx`
      models `user_not_registered` and `auth_required` as distinct states —
      keep both.
- [ ] Point `src/api/` at the new API instead of Base44. This is the payoff for
      the facade: nine files change, no component does.
- [ ] Move `InvokeLLM` server-side. `planner-core.js` moves unchanged; only the
      four lines of transport in `planner.js` are rewritten.
- [ ] Per-tenant token caps and a cost ceiling. An unbounded LLM bill on a free
      trial is a real way to lose money on a product with no revenue.
- [ ] Neon branch, migrations wired to CI, seed script.
- [ ] Delete `@base44/sdk`, `@base44/vite-plugin`, `src/lib/app-params.js` and
      `base44/`. **Delete `app-params.js` deliberately** — it reads an access
      token from the URL query string into `localStorage`, and that must not
      survive.
- [ ] Deploy. Vercel. Note the workspace trap: Vercel is not git-connected here,
      `vercel deploy --prod` ships the *directory*, so land to `main` first.

**Gate:** the app runs end to end with no Base44 credentials anywhere.

---

## Phase 3 — Safe for strangers

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
      relationship messages, not marketing — but the *invite* email and any
      launch outreach are covered by CASL and CAN-SPAM. Unsubscribe path,
      physical address, honest sender.
- [ ] Backups and a restore you have actually run once.
- [ ] Delete-my-workspace. The cascades in `001_initial.sql` already make this
      one statement; expose it.

---

## Phase 4 — Go to market

- [ ] **Sharpen the position.** "The AI chief of staff that chases people so you
      do not have to." The competition (Asana, Linear, Motion, Height) all sell
      a *place to put work*. Bosun sells the thing nobody does: the follow-up.
      Never lead with the board — it is the weakest thing here and the page
      already says so.
- [ ] **Name the buyer.** Best guess: a lead of 3–15 people who does not have a
      project manager and is personally the bottleneck on chasing. Agencies,
      small studios, ops teams. Not enterprise, not solo.
- [ ] **Price it (D3).** Seat-based, published, self-serve. Anchor against a
      part-time coordinator, not against Asana — that framing is the whole
      pitch. Free trial with a hard token cap.
- [ ] **Five design partners before the price is final.** They use it free and
      tell you what breaks. This is the only research that counts.
- [ ] **Landing page v2.** The page is honest today but it is a brochure: there
      is no way for an interested visitor to do anything. It needs an email
      capture, and GitHub Pages cannot take a form submission — this is
      Phase 2's deploy, or a hosted form.
- [ ] Buy the domain (D2). Move the page off `github.io`.
- [ ] Screenshots and a 60-second demo of the *loop*, not the board. The demo is
      a nudge arriving and a reply landing on a task.
- [ ] Launch assets: Product Hunt, one founder post, three outbound emails to
      people who have complained about chasing their team.

---

## Phase 5 — Launch

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
- [ ] A second workspace cannot see the first one's data — verified by a test at
      the HTTP layer, not only at the query layer.
- [ ] Terms and privacy published, and accurate about the model provider.
- [ ] Someone who is not you completed signup with no help.
- [ ] A card has been charged and refunded successfully.
- [ ] `npm test`, `npm run lint`, `npm run build` green in CI on `main`.

---

## Deliberately not doing

- A mobile app.
- Integrations beyond the one chosen delivery channel.
- Gantt charts, time tracking, sprints, story points. Every one of them makes
  Bosun a worse Asana instead of the only thing that follows up.
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

## Working agreements

- `main` is green. CI runs tests, lint, build, and guards the
  `src/api` boundary.
- Anything that changes a component and a query in the same commit is probably
  two commits.
- New pure logic gets a test in `test/`. The four bugs found in the last session
  were all found by tests, not by reading.
