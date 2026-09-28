"use strict";

const School = require("../models/School");

async function getSchools({
  districtCode,
  blockCode,
  clusterCode,
  search,
  page = 1,
  limit = 20,
}) {
  const filter = {};

  if (districtCode) filter.districtCode = districtCode;
  if (blockCode) filter.blockCode = blockCode;
  if (clusterCode) filter.clusterCode = clusterCode;

  if (search) {
    const cleaned = search.trim();
    if (cleaned) {
      const regex = new RegExp(cleaned, "i");
      filter.$or = [
        { schoolName: regex },
        { udiseCode: { $regex: `^${cleaned}` } },
      ];
    }
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    School.find(filter)
      .sort({ schoolName: 1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    School.countDocuments(filter),
  ]);

  return {
    items,
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit),
  };
}

module.exports = { getSchools };
