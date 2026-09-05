/**
 * The Northbound portfolio, as goals and tasks.
 *
 * The products are real. The task lists are a plausible reconstruction, not a
 * record of what has actually been done.
 *
 * Shared by `npm run demo` (renders it) and `npm run seed` (writes it into the
 * local database), so the two cannot drift apart.
 */

export const NOW = new Date();
export const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);
export const daysAhead = (n) => new Date(NOW.getTime() + n * 86400000);
export const iso = (d) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------- the data
//
// The products are real. The task lists are a plausible reconstruction, not a
// record of what has actually been done.

export const TEAM = [
  { email: "melaniesigridab@gmail.com", full_name: "Melanie Baratto", role: "lead",
    ping_frequency: "daily", ai_tone: "direct" },
];

export const PORTFOLIO = [
  {
    goal: "ZipQuarry: first paying customer",
    description: "The marketing site is live at zipquarry.com. Nothing has been sold.",
    target: daysAhead(21),
    tasks: [
      { title: "Publish the price on the marketing site", owner: 0, due: daysAgo(9), quiet: 12 },
      { title: "Wire Stripe checkout end to end", owner: 0, due: daysAgo(2), quiet: 6 },
      { title: "Send 20 outbound emails to local service businesses", owner: 0, due: daysAhead(4), quiet: 5 },
      { title: "Confirm CASL compliance on the outbound sequence", owner: null, due: daysAhead(10), quiet: 14 },
      { title: "Move marketing edits into zipquarry-platform/www", owner: 0, status: "done", quiet: 20 },
    ],
  },
  {
    goal: "Shipshape: run it against a live database",
    description: "Domain is complete and tested. The app has never been installed or run.",
    target: daysAhead(10),
    tasks: [
      { title: "pnpm install and push the schema to a Neon branch", owner: 0, due: daysAgo(5), quiet: 11 },
      { title: "Seed the built-in rubrics and demo projects", owner: 0, due: daysAhead(1), quiet: 3 },
      { title: "Sign in once with the magic link and score one project", owner: 0, due: daysAhead(2), quiet: 3 },
    ],
  },
  {
    goal: "Bosun: answer D1 to D4",
    description: "The follow-up loop is half built. Four decisions block the rest.",
    target: daysAhead(5),
    tasks: [
      { title: "D1 — pick the server shape: Node API or Next.js", owner: 0, due: daysAhead(2), quiet: 0.2 },
      { title: "D2 — trademark and domain check on the name", owner: 0, due: daysAhead(2), quiet: 1 },
      { title: "D4 — decide whether Bosun gets finished or parked", owner: 0, due: daysAhead(1), quiet: 0.2 },
      { title: "Deliver the first real nudge on a schedule", owner: 0, status: "need_help", quiet: 2 },
    ],
  },
  {
    goal: "Windward: make the five pillars trustworthy",
    description: "Rails 8 API plus a Python analytics engine. Every displayed number is computed.",
    target: daysAhead(30),
    tasks: [
      { title: "Pin down the market-data ingestion source", owner: 0, due: daysAgo(1), quiet: 8 },
      { title: "Write the grading logic tests nobody can argue with", owner: null, due: daysAhead(12), quiet: 16 },
      { title: "Decide what happens when a pillar has no data", owner: null, quiet: 16 },
    ],
  },
  {
    goal: "ReconAI: one pilot with a bookkeeping firm",
    description: "Claude reads and matches; TypeScript does every calculation.",
    target: daysAhead(35),
    tasks: [
      { title: "Build the invoice/PO matching eval set", owner: 0, due: daysAhead(8), quiet: 4 },
      { title: "Find three bookkeeping firms to approach", owner: null, quiet: 19 },
      { title: "Cap per-tenant token spend before anyone uploads", owner: 0, status: "blocked", quiet: 7 },
    ],
  },
  {
    goal: "Quotefront: photo to findings",
    description: "Prospects upload job details and photos; the app returns a structured estimate.",
    target: daysAhead(40),
    tasks: [
      { title: "Harden the vision pipeline against unusable photos", owner: 0, due: daysAhead(15), quiet: 6 },
      { title: "Decide the estimate range the model is allowed to state", owner: null, quiet: 22 },
    ],
  },
  {
    goal: "Studio: move the repos into the org",
    description: "Everything still lives on a personal GitHub account.",
    target: daysAhead(14),
    tasks: [
      { title: "Create the org and move the eight product repos", owner: 0, due: daysAgo(4), quiet: 25 },
      { title: "Re-point the Pages and Vercel deployments", owner: null, quiet: 25 },
    ],
  },
];

