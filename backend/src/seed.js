"use strict";

const mongoose = require("mongoose");
const School = require("./models/School");
const User = require("./models/User");
const Questionnaire = require("./models/Questionnaire");
const schools = require("./data/schools.json");
const questionnaires = require("./data/questionnaires.json");

async function seed() {
  const mongoUri =
    process.env.MONGO_URI ||
    "mongodb+srv://asutoshs170_db_user:0b1g0khU0wc7uakR@cluster0.txsw7fq.mongodb.net/school-visit-logging?retryWrites=true&w=majority&appName=Cluster0";
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
