"use strict";

const express = require("express");
const cors = require("cors");
const routes = require("./src/routes");
const errorHandler = require("./src/middleware/errorHandler");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(routes);
app.use(errorHandler);

module.exports = app;
