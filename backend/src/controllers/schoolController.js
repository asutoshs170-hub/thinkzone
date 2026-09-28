"use strict";

const { getSchools } = require("../services/schoolService");

async function listSchools(req, res, next) {
  try {
    const result = await getSchools(req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = { listSchools };
