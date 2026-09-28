"use strict";

const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    type: {
      type: String,
      enum: ["yesNo", "number", "singleChoice", "text"],
      required: true,
    },
    required: { type: Boolean, default: false },
    options: [{ type: String }],
    min: { type: Number },
    max: { type: Number },
    placeholder: { type: String },
  },
  { _id: false },
);

const questionnaireSchema = new mongoose.Schema(
  {
    month: { type: Number, required: true, index: true },
    year: { type: Number, required: true, index: true },
    title: { type: String, required: true },
    questions: [questionSchema],
  },
  { timestamps: true },
);

questionnaireSchema.index({ year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model(
  "Questionnaire",
  questionnaireSchema,
  "questionnaires",
);
