"use strict";

const mongoose = require("mongoose");

const schoolSchema = new mongoose.Schema(
  {
    udiseCode: { type: String, required: true, unique: true, index: true },
    schoolName: { type: String, required: true },
    districtCode: { type: String, required: true, index: true },
    districtName: { type: String, required: true },
    blockCode: { type: String, required: true, index: true },
    blockName: { type: String, required: true },
    clusterCode: { type: String, required: true, index: true },
    clusterName: { type: String, required: true },
    villageName: { type: String },
    category: { type: String },
  },
  { timestamps: true },
);

schoolSchema.index({ schoolName: "text", udiseCode: 1 });

module.exports = mongoose.model("School", schoolSchema, "schools");
