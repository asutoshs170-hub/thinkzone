"use strict";

const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const visitSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "School",
      index: true,
    },
    udiseCode: { type: String, required: true, index: true },
    districtCode: { type: String, required: true, index: true },
    blockCode: { type: String, required: true, index: true },
    clusterCode: { type: String, required: true, index: true },
    visitedAt: { type: Date, required: true, index: true },
    year: { type: Number, required: true, index: true },
    month: { type: Number, required: true, index: true },
    answers: [answerSchema],
    status: {
      type: String,
      enum: ["Pending", "Synced", "Failed"],
      default: "Pending",
      index: true,
    },
    failureReason: { type: String, default: "" },
    source: { type: String, default: "mobile" },
  },
  { timestamps: true },
);

visitSchema.index({ userId: 1, year: 1, month: 1, visitedAt: -1 });

module.exports = mongoose.model("Visit", visitSchema, "visits");
