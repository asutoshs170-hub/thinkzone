"use strict";

const express = require("express");
const schoolController = require("../controllers/schoolController");
const questionnaireController = require("../controllers/questionnaireController");
const visitController = require("../controllers/visitController");

const router = express.Router();

router.get("/api/schools", schoolController.listSchools);
router.get(
  "/api/questionnaires/current",
  questionnaireController.getCurrentQuestionnaire,
);
router.post("/api/visits", visitController.createVisitRecord);
router.get("/api/visits", visitController.listVisitRecords);
router.get("/api/reports/block-summary", visitController.getReportSummary);

module.exports = router;
