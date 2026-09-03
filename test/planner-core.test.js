import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildContext,
  normalizeQuestions,
  normalizeTasks,
  questionPrompt,
  taskPrompt,
} from "../src/api/planner-core.js";

describe("normalizeQuestions", () => {
  it("keeps usable strings and trims them", () => {
    assert.deepEqual(
      normalizeQuestions({ questions: ["  Who signs off?  ", "By when?"] }),
      ["Who signs off?", "By when?"],
    );
  });

  it("drops blanks and non-strings rather than rendering them", () => {
    assert.deepEqual(
      normalizeQuestions({ questions: ["Real?", "", "   ", null, 42, { q: "x" }] }),
      ["Real?"],
    );
  });

  it("treats a missing or malformed response as no questions", () => {
    assert.deepEqual(normalizeQuestions(undefined), []);
    assert.deepEqual(normalizeQuestions({}), []);
    assert.deepEqual(normalizeQuestions({ questions: null }), []);
  });
});

describe("normalizeTasks", () => {
  const one = (over = {}) => normalizeTasks({ tasks: [{ title: "T", ...over }] })[0];

  it("drops a task with no usable title, because it cannot become a row", () => {
    const tasks = normalizeTasks({
      tasks: [{ title: "Keep" }, { title: "   " }, { title: 7 }, {}, null],
    });
    assert.deepEqual(tasks.map((t) => t.title), ["Keep"]);
  });

  it("coerces estimated_hours so a numeric column cannot be poisoned", () => {
    assert.equal(one({ estimated_hours: 3 }).estimated_hours, 3);
    assert.equal(one({ estimated_hours: "4" }).estimated_hours, 4);
    // The failure this guards: a model answering in prose.
    assert.equal(one({ estimated_hours: "3h" }).estimated_hours, undefined);
    assert.equal(one({ estimated_hours: null }).estimated_hours, undefined);
    assert.equal(one({}).estimated_hours, undefined);
  });

  it("defaults every optional string so no row carries undefined", () => {
    const t = one();
    for (const key of [
      "description",
      "assignee_id",
      "assignee_name",
      "assignee_email",
      "deadline",
    ]) {
      assert.equal(t[key], "", `${key} should default to an empty string`);
    }
  });

  it("treats a missing or malformed response as no tasks", () => {
    assert.deepEqual(normalizeTasks(undefined), []);
    assert.deepEqual(normalizeTasks({ tasks: "nope" }), []);
  });
});

describe("buildContext", () => {
  it("pairs each question with its answer by index", () => {
    assert.equal(
      buildContext(["Scope?", "Owner?"], { 0: "Small", 1: "Ana" }),
      "Q: Scope?\nA: Small\n\nQ: Owner?\nA: Ana",
    );
  });

  it("says so explicitly when a question went unanswered", () => {
    assert.equal(buildContext(["Scope?"], {}), "Q: Scope?\nA: No answer");
  });

  it("is empty when there is nothing to describe", () => {
    assert.equal(buildContext(), "");
  });
});

describe("prompts", () => {
  const goal = {
    title: "Ship the pricing page",
    description: "Public tiers",
    targetDate: new Date(2026, 8, 30),
    teamMembers: [
      { id: "u1", full_name: "Ana Diaz", email: "ana@x.com" },
      { id: "u2", email: "bo@x.com" },
    ],
  };

  it("carries the goal and the roster into the question prompt", () => {
    const p = questionPrompt(goal);
    assert.match(p, /Ship the pricing page/);
    assert.match(p, /2026-09-30/);
    // Falls back to the email when a member has no name.
    assert.match(p, /Ana Diaz, bo@x\.com/);
  });

  it("says the date is unset rather than printing a stray value", () => {
    assert.match(questionPrompt({ ...goal, targetDate: null }), /Target Date: Not set/);
    assert.match(
      questionPrompt({ ...goal, teamMembers: [] }),
      /Team Members: Not specified yet/,
    );
  });

  it("gives the task prompt the roster as ids the model can assign to", () => {
    const p = taskPrompt({ ...goal, context: "Q: Scope?\nA: Small" });
    assert.match(p, /"id":"u1"/);
    assert.match(p, /"name":"Ana Diaz"/);
    assert.match(p, /Q: Scope\?/);
    assert.match(p, /Target Date: 2026-09-30/);
  });

  it("defaults the task deadline horizon when no target date is set", () => {
    assert.match(
      taskPrompt({ ...goal, targetDate: null, context: "" }),
      /Target Date: End of month/,
    );
  });
});
