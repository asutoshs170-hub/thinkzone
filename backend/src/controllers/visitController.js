"use strict";

const {
  createVisit,
  listVisits,
  getBlockSummary,
} = require("../services/visitService");

async function createVisitRecord(req, res, next) {
  try {
    const { clientId, userId, udiseCode, visitedAt, answers } = req.body || {};
    const result = await createVisit({
      clientId,
      userId,
      udiseCode,
      visitedAt,
      answers,
    });

    if (result.duplicate) {
      return res.status(200).json({
        message: "Visit already exists for this clientId",
        duplicate: true,
        visit: result.visit,
      });
    }

    res.status(201).json({
      message: "Visit created",
      visit: result.visit,
    });
  } catch (error) {
    next(error);
  }
}

async function listVisitRecords(req, res, next) {
  try {
    const result = await listVisits(req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getReportSummary(req, res, next) {
  try {
    const rows = await getBlockSummary(req.query);
    res.json(rows);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createVisitRecord,
  listVisitRecords,
  getReportSummary,
};
