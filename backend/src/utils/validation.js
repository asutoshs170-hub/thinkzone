"use strict";

function getIstDateParts(dateInput) {
  const value = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(value);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function validateAnswersAgainstQuestionnaire(questionnaire, answers = {}) {
  if (!questionnaire || !Array.isArray(questionnaire.questions)) {
    throw new Error("Questionnaire is invalid.");
  }

  for (const question of questionnaire.questions) {
    const answer = answers[question.id];
    const isRequired = Boolean(question.required);

    if (
      isRequired &&
      (answer === undefined || answer === null || answer === "")
    ) {
      throw new Error(`Answer for ${question.id} is required.`);
    }

    if (answer === undefined || answer === null || answer === "") {
      continue;
    }

    switch (question.type) {
      case "yesNo": {
        const valid = ["Yes", "No", "yes", "no", true, false].includes(answer);
        if (!valid) {
          throw new Error(`Answer for ${question.id} must be Yes or No.`);
        }
        break;
      }
      case "number": {
        const numericValue = Number(answer);
        if (!Number.isFinite(numericValue)) {
          throw new Error(`Answer for ${question.id} must be a number.`);
        }
        break;
      }
      case "singleChoice": {
        if (
          !Array.isArray(question.options) ||
          !question.options.includes(answer)
        ) {
          throw new Error(
            `Answer for ${question.id} must match one of the valid choices.`,
          );
        }
        break;
      }
      case "text": {
        if (typeof answer !== "string" || !answer.trim()) {
          throw new Error(
            `Answer for ${question.id} must be a valid text response.`,
          );
        }
        break;
      }
      default:
        throw new Error(
          `Unsupported question type for ${question.id}: ${question.type}`,
        );
    }
  }

  return true;
}

module.exports = {
  getIstDateParts,
  validateAnswersAgainstQuestionnaire,
};
