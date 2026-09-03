import { format } from "date-fns";

/**
 * The planning logic that has no I/O: prompt construction, the response
 * schemas, and the normalisation applied to whatever the model returns.
 *
 * Nothing here imports the client, touches env, or reaches the network, which
 * is what makes it unit testable — and it is the half that survives when the
 * model call moves server-side in MIGRATION.md step 5.
 */

export const QUESTION_SCHEMA = {
  type: "object",
  properties: { questions: { type: "array", items: { type: "string" } } },
};

export const TASK_SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          assignee_id: { type: "string" },
          assignee_name: { type: "string" },
          assignee_email: { type: "string" },
          deadline: { type: "string" },
          estimated_hours: { type: "number" },
        },
      },
    },
  },
};

const asDate = (d, fallback) => (d ? format(d, "yyyy-MM-dd") : fallback);

/** A model can answer with an object or a bare string where a list was asked for. */
const asArray = (v) => (Array.isArray(v) ? v : []);

/**
 * Number(null), Number("") and Number(false) are all 0, so a plain
 * Number.isFinite check turns a missing estimate into a confident "0 hours".
 * Only an actual number, or a string that is entirely one, counts.
 */
const asHours = (v) => {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : undefined;
  if (typeof v !== "string" || !v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

const nameOf = (m) => m.full_name || m.email;

/** Turn the answered questions into the context string the planner reads. */
export const buildContext = (questions = [], answers = {}) =>
  questions.map((q, i) => `Q: ${q}\nA: ${answers[i] || "No answer"}`).join("\n\n");

export const questionPrompt = ({
  title,
  description,
  targetDate,
  teamMembers = [],
}) =>
  `You are a smart project management AI. A team lead wants to create a goal:
Title: "${title}"
Description: "${description}"
Target Date: ${asDate(targetDate, "Not set")}
Team Members: ${teamMembers.map(nameOf).join(", ") || "Not specified yet"}

Generate exactly 3 short, focused clarifying questions to better understand scope, priorities, and constraints before breaking this into tasks. Questions should be practical and help create actionable tasks.

Return as JSON.`;

export const taskPrompt = ({
  title,
  description,
  targetDate,
  context,
  teamMembers = [],
}) => {
  const roster = teamMembers.map((m) => ({
    id: m.id,
    name: nameOf(m),
    email: m.email,
  }));

  return `You are a project management AI. Break down this goal into actionable tasks.

Goal: "${title}"
Description: "${description}"
Target Date: ${asDate(targetDate, "End of month")}

Context from clarifying questions:
${context}

Available team members: ${JSON.stringify(roster)}

Create 4-8 tasks. For each task, suggest the best assignee based on a balanced workload (spread evenly). Set realistic deadlines working backwards from the target date. Give estimated hours for each task.

Return as JSON.`;
};

/** Usable question strings only. Anything blank or non-string is dropped. */
export const normalizeQuestions = (res) =>
  asArray(res?.questions)
    .filter((q) => typeof q === "string" && q.trim())
    .map((q) => q.trim());

/**
 * These become rows, so an unchecked response is corrupt data rather than a bad
 * string. A task with no title is unusable and is dropped; estimated_hours is
 * coerced so a model answering "3h" cannot poison a numeric column.
 */
export const normalizeTasks = (res) =>
  asArray(res?.tasks)
    .filter((t) => t && typeof t.title === "string" && t.title.trim())
    .map((t) => ({
      title: t.title.trim(),
      description: t.description ?? "",
      assignee_id: t.assignee_id ?? "",
      assignee_name: t.assignee_name ?? "",
      assignee_email: t.assignee_email ?? "",
      deadline: t.deadline ?? "",
      estimated_hours: asHours(t.estimated_hours),
    }));
