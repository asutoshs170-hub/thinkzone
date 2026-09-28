"use strict";

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    role: { type: String, default: "Field Officer" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema, "users");
