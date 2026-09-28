"use strict";

const { getQuestionnaireForDate } = require("../services/visitService");

async function getCurrentQuestionnaire(req, res, next) {
  try {
    const now = new Date();
    const questionnaire = await getQuestionnaireForDate(now);

    if (!questionnaire) {
      return res
        .status(404)
        .json({ error: "Questionnaire not found for current month" });
    }

    res.json(questionnaire);
  } catch (error) {
    next(error);
  }
}

module.exports = { getCurrentQuestionnaire };
