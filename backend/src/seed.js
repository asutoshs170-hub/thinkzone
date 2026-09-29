"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const School = require("./models/School");
const User = require("./models/User");
const Questionnaire = require("./models/Questionnaire");
const schools = require("./data/schools.json");
const questionnaires = require("./data/questionnaires.json");

async function seed() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is not configured");
  }
  await mongoose.connect(mongoUri);

  await School.deleteMany({});
  await User.deleteMany({});
  await Questionnaire.deleteMany({});

  await School.insertMany(schools);

  const demoUsers = [
    { userId: "U1001", name: "Asha Patra" },
    { userId: "U1002", name: "Ramesh Nayak" },
    { userId: "U1003", name: "Sunita Das" },
  ];

  await User.insertMany(demoUsers);
  await Questionnaire.insertMany(questionnaires);

  console.log("Seed complete");
  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
