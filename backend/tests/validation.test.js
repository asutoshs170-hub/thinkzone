"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getIstDateParts,
  validateAnswersAgainstQuestionnaire,
} = require("../src/utils/validation");

test("getIstDateParts uses Asia/Kolkata timezone", () => {
  const result = getIstDateParts(new Date("2026-09-15T18:30:00Z"));
  assert.equal(result.year, 2026);
  assert.equal(result.month, 9);
});

test("validateAnswersAgainstQuestionnaire rejects missing required answers", () => {
  const questionnaire = {
    questions: [
      { id: "q1", type: "yesNo", required: true },
      { id: "q2", type: "number", required: true },
    ],
  };

  assert.throws(() => {
    validateAnswersAgainstQuestionnaire(questionnaire, { q1: "Yes" });
  }, /required/i);
});

test("validateAnswersAgainstQuestionnaire allows valid yesNo and singleChoice answers", () => {
  const questionnaire = {
    questions: [
      { id: "q1", type: "yesNo", required: true, options: ["Yes", "No"] },
      { id: "q2", type: "singleChoice", required: true, options: ["A", "B"] },
    ],
  };

  assert.doesNotThrow(() => {
    validateAnswersAgainstQuestionnaire(questionnaire, { q1: "Yes", q2: "A" });
  });
});
