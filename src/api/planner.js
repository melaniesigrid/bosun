import { post } from "./http";
import {
  buildContext,
  normalizeQuestions,
  normalizeTasks,
} from "./planner-core";

/**
 * The two model calls that turn an objective into work.
 *
 * The prompts, schemas and normalisation live in planner-core.js and are
 * unit tested. This module is only the transport, and the server does not
 * answer it yet: moving InvokeLLM off Base44 is the one part of MIGRATION.md
 * step 5 still outstanding, because it needs a model key and a per-tenant spend
 * cap. Until then these surface a clear error rather than pretending.
 */

export async function clarifyingQuestions(goal) {
  return normalizeQuestions(await post("/plan/questions", goal));
}

export async function proposeTasks(goal) {
  return normalizeTasks(await post("/plan/tasks", goal));
}

export { buildContext };
