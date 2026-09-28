"use strict";

const {
  getIstDateParts,
  validateAnswersAgainstQuestionnaire,
} = require("../utils/validation");
const User = require("../models/User");
const School = require("../models/School");
const Visit = require("../models/Visit");
const Questionnaire = require("../models/Questionnaire");

function normalizeAnswers(answers = []) {
  if (Array.isArray(answers)) {
    return answers;
  }

  return Object.entries(answers).map(([questionId, value]) => ({
    questionId,
    value,
  }));
}

async function getQuestionnaireForDate(date) {
  const ist = getIstDateParts(date);
  const currentQuestionnaire = await Questionnaire.findOne({
    year: ist.year,
    month: ist.month,
  }).lean();
  return currentQuestionnaire;
}

async function validateVisitPayload({
  userId,
  udiseCode,
  visitedAt,
  answers,
  clientId,
}) {
  if (!userId)
    throw Object.assign(new Error("userId is required"), { statusCode: 400 });
  if (!udiseCode)
    throw Object.assign(new Error("udiseCode is required"), {
      statusCode: 400,
    });
  if (!visitedAt)
    throw Object.assign(new Error("visitedAt is required"), {
      statusCode: 400,
    });
  if (!clientId)
    throw Object.assign(new Error("clientId is required"), { statusCode: 400 });

  const user = await User.findOne({ userId }).lean();
  if (!user)
    throw Object.assign(new Error("User not found"), { statusCode: 404 });

  const school = await School.findOne({ udiseCode }).lean();
  if (!school)
    throw Object.assign(new Error("School not found"), { statusCode: 404 });

  const visitedDate = new Date(visitedAt);
  if (Number.isNaN(visitedDate.getTime())) {
    throw Object.assign(new Error("visitedAt is invalid"), { statusCode: 400 });
  }

  const now = new Date();
  const diffMs = visitedDate.getTime() - now.getTime();
  if (diffMs > 5 * 60 * 1000) {
    throw Object.assign(
      new Error("visitedAt cannot be more than 5 minutes in the future"),
      { statusCode: 400 },
    );
  }

  const ist = getIstDateParts(visitedDate);
  const questionnaire = await Questionnaire.findOne({
    year: ist.year,
    month: ist.month,
  }).lean();
  if (!questionnaire) {
    throw Object.assign(
      new Error("No questionnaire available for the selected month"),
      { statusCode: 404 },
    );
  }

  const normalizedAnswers = normalizeAnswers(answers);
  const asObject = {};
  for (const entry of normalizedAnswers) {
    asObject[entry.questionId] = entry.value;
  }

  validateAnswersAgainstQuestionnaire(questionnaire, asObject);

  return {
    user,
    school,
    questionnaire,
    visitedDate,
    questionMap: asObject,
    normalizedAnswers,
    ist,
  };
}

async function createVisit({
  clientId,
  userId,
  udiseCode,
  visitedAt,
  answers,
}) {
  const payload = await validateVisitPayload({
    clientId,
    userId,
    udiseCode,
    visitedAt,
    answers,
  });

  const existingVisit = await Visit.findOne({ clientId }).lean();
  if (existingVisit) {
    return {
      created: false,
      visit: existingVisit,
      duplicate: true,
    };
  }

  const visit = new Visit({
    clientId,
    userId,
    schoolId: payload.school._id,
    udiseCode,
    districtCode: payload.school.districtCode,
    blockCode: payload.school.blockCode,
    clusterCode: payload.school.clusterCode,
    visitedAt: payload.visitedDate,
    year: payload.ist.year,
    month: payload.ist.month,
    answers: payload.normalizedAnswers,
    status: "Synced",
  });

  await visit.save();
  return { created: true, visit, duplicate: false };
}

async function listVisits({ userId, month, year, page = 1, limit = 20 }) {
  const filter = {};
  if (userId) filter.userId = userId;
  if (month) filter.month = Number(month);
  if (year) filter.year = Number(year);

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    Visit.find(filter)
      .sort({ visitedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate("schoolId", "schoolName")
      .lean(),
    Visit.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => ({
      ...item,
      schoolName: item.schoolId ? item.schoolId.schoolName : item.udiseCode,
    })),
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit),
  };
}

async function getBlockSummary({ districtCode, month, year }) {
  const matchStage = { districtCode: districtCode || { $exists: true } };
  if (month) matchStage.month = Number(month);
  if (year) matchStage.year = Number(year);

  const allBlocks = await School.aggregate([
    {
      $match: districtCode ? { districtCode } : {},
    },
    {
      $group: {
        _id: "$blockCode",
        blockName: { $first: "$blockName" },
        districtCode: { $first: "$districtCode" },
        totalSchools: { $sum: 1 },
      },
    },
    { $sort: { blockName: 1 } },
  ]);

  const visits = await Visit.aggregate([
    {
      $match: matchStage,
    },
    {
      $group: {
        _id: "$blockCode",
        schoolsVisited: { $addToSet: "$udiseCode" },
        uniqueVisitors: { $addToSet: "$userId" },
        visits: { $sum: 1 },
      },
    },
  ]);

  const blockMap = new Map();
  for (const item of visits) {
    blockMap.set(item._id, item);
  }

  const districtTotal = await School.countDocuments({
    districtCode: districtCode || { $exists: true },
  });

  const rows = allBlocks.map((block) => {
    const visitData = blockMap.get(block._id) || {
      schoolsVisited: [],
      uniqueVisitors: [],
      visits: 0,
    };

    return {
      districtCode: block.districtCode,
      blockCode: block._id,
      blockName: block.blockName,
      totalSchools: block.totalSchools,
      schoolsVisited: visitData.schoolsVisited.length,
      uniqueVisitors: visitData.uniqueVisitors.length,
      visits: visitData.visits,
      coveragePercent: block.totalSchools
        ? (
            (visitData.schoolsVisited.length / block.totalSchools) *
            100
          ).toFixed(2)
        : "0.00",
      districtTotal,
    };
  });

  return rows;
}

module.exports = {
  createVisit,
  listVisits,
  getQuestionnaireForDate,
  getBlockSummary,
  validateVisitPayload,
};
