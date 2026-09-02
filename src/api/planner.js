import { format } from "date-fns";
import { base44 } from "./base44Client";

/**
 * The planning brain: the two model calls that turn an objective into work.
 *
 * These prompts used to live inside GoalCreationWizard. They are business
 * logic, not view logic, and MIGRATION.md step 5 moves them server-side — so
 * they live behind this module and the wizard never sees a prompt string.
 *
 * Both calls parse straight into rows we persist, so an unchecked response is
 * not a bad string, it is corrupt data. Everything the model returns is
 * normalised here before it reaches a caller.
 */

const ask = (prompt, schema) =>
  base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema });

const asDate = (d, fallback) => (d ? format(d, "yyyy-MM-dd") : fallback);

const describeMembers = (members = []) =>
  members.map((m) => m.full_name || m.email).join(", ");

/**
 * Three questions a good chief of staff would ask before planning against a
 * goal. Returns plain strings; anything blank or non-string is dropped.
 */
export async function clarifyingQuestions({
  title,
  description,
  targetDate,
  teamMembers = [],
}) {
  const res = await ask(
    `You are a smart project management AI. A team lead wants to create a goal:
Title: "${title}"
Description: "${description}"
Target Date: ${asDate(targetDate, "Not set")}
Team Members: ${describeMembers(teamMembers) || "Not specified yet"}

Generate exactly 3 short, focused clarifying questions to better understand scope, priorities, and constraints before breaking this into tasks. Questions should be practical and help create actionable tasks.

Return as JSON.`,
    {
      type: "object",
      properties: { questions: { type: "array", items: { type: "string" } } },
    },
  );

  return (res?.questions ?? [])
    .filter((q) => typeof q === "string" && q.trim())
    .map((q) => q.trim());
}

/**
 * A proposed task list for a goal. These are suggestions shown for review, not
 * rows — the wizard writes them only after the user approves.
 *
 * A task with no title is unusable and is dropped rather than shown. Hours are
 * coerced to a number so a model returning "3h" cannot poison the field.
 */
export async function proposeTasks({
  title,
  description,
  targetDate,
  context,
  teamMembers = [],
}) {
  const roster = teamMembers.map((m) => ({
    id: m.id,
    name: m.full_name || m.email,
    email: m.email,
  }));

  const res = await ask(
    `You are a project management AI. Break down this goal into actionable tasks.

Goal: "${title}"
Description: "${description}"
Target Date: ${asDate(targetDate, "End of month")}

Context from clarifying questions:
${context}

Available team members: ${JSON.stringify(roster)}

Create 4-8 tasks. For each task, suggest the best assignee based on a balanced workload (spread evenly). Set realistic deadlines working backwards from the target date. Give estimated hours for each task.

Return as JSON.`,
    {
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
    },
  );

  return (res?.tasks ?? [])
    .filter((t) => t && typeof t.title === "string" && t.title.trim())
    .map((t) => ({
      title: t.title.trim(),
      description: t.description ?? "",
      assignee_id: t.assignee_id ?? "",
      assignee_name: t.assignee_name ?? "",
      assignee_email: t.assignee_email ?? "",
      deadline: t.deadline ?? "",
      estimated_hours: Number.isFinite(Number(t.estimated_hours))
        ? Number(t.estimated_hours)
        : undefined,
    }));
}

/** Turn the answered questions into the context string the planner reads. */
export const buildContext = (questions = [], answers = {}) =>
  questions.map((q, i) => `Q: ${q}\nA: ${answers[i] || "No answer"}`).join("\n\n");
