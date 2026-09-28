"use strict";

const mongoose = require("mongoose");

async function connectDB() {
  const mongoUri =
    process.env.MONGO_URI ||
    "mongodb+srv://asutoshs170_db_user:0b1g0khU0wc7uakR@cluster0.txsw7fq.mongodb.net/school-visit-logging?retryWrites=true&w=majority&appName=Cluster0";

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 20,
    });
    console.log("MongoDB Atlas connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
}

module.exports = { connectDB };
