import { base44 } from "./base44Client";
import {
  QUESTION_SCHEMA,
  TASK_SCHEMA,
  buildContext,
  normalizeQuestions,
  normalizeTasks,
  questionPrompt,
  taskPrompt,
} from "./planner-core";

/**
 * The two model calls that turn an objective into work.
 *
 * This module is only the transport. Every prompt, schema and normalisation
 * rule lives in planner-core.js, which has no I/O and is unit tested — so when
 * MIGRATION.md step 5 moves these calls server-side, the logic moves with them
 * unchanged and only the four lines below are rewritten.
 */

const ask = (prompt, schema) =>
  base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema });

/** Three questions a good chief of staff would ask before planning. */
export async function clarifyingQuestions(goal) {
  return normalizeQuestions(await ask(questionPrompt(goal), QUESTION_SCHEMA));
}

/**
 * A proposed task list. These are suggestions shown for review, not rows — the
 * wizard writes them only once the user approves.
 */
export async function proposeTasks(goal) {
  return normalizeTasks(await ask(taskPrompt(goal), TASK_SCHEMA));
}

export { buildContext };
