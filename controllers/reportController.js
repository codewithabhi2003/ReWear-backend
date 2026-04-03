const asyncHandler = require('express-async-handler');
const Report       = require('../models/Report');
const Product      = require('../models/Product');
const User         = require('../models/User');
const { sendResponse } = require('../utils/apiResponse');

// ─── POST /api/reports ───────────────────────────────────────────────────────
// Any logged-in user can file a report
const createReport = asyncHandler(async (req, res) => {
  const { targetType, reason, details } = req.body;
  let targetId = req.body.targetId || 'general';  // let so we can default it

  if (!targetType || !reason) {
    res.status(400);
    throw new Error('targetType and reason are required');
  }

  // Build snapshot — only if targetId looks like a real ObjectId
  let snapshot = {};
  const isObjectId = /^[a-f\d]{24}$/i.test(targetId);
  if (isObjectId) {
    if (targetType === 'product') {
      const p = await Product.findById(targetId).lean();
      if (p) snapshot = { title: p.title, image: p.images?.[0] || '', url: `/product/${p._id}` };
    } else if (targetType === 'seller') {
      const u = await User.findById(targetId).lean();
      if (u) snapshot = { title: u.name, image: u.avatar || '', url: `/seller/${u._id}` };
    }
  }

  const report = await Report.create({
    reportedBy:     req.user._id,
    targetType,
    targetId,
    targetSnapshot: snapshot,
    reason,
    details: (details || '').slice(0, 500),
  });

  sendResponse(res, 201, 'Report submitted', { report });
});

// ─── GET /api/reports (admin only) ───────────────────────────────────────────
const getReports = asyncHandler(async (req, res) => {
  const { status = 'pending', page = 1, limit = 20 } = req.query;

  const filter = status === 'all' ? {} : { status };
  const total  = await Report.countDocuments(filter);
  const reports = await Report.find(filter)
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate('reportedBy', 'name email avatar')
    .lean();

  sendResponse(res, 200, 'Reports fetched', {
    reports,
    pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
  });
});

// ─── PUT /api/reports/:id (admin only) ───────────────────────────────────────
const updateReport = asyncHandler(async (req, res) => {
  const { status, adminNote } = req.body;

  const report = await Report.findByIdAndUpdate(
    req.params.id,
    { status, adminNote: adminNote || '', updatedAt: new Date() },
    { new: true }
  ).populate('reportedBy', 'name email');

  if (!report) { res.status(404); throw new Error('Report not found'); }
  sendResponse(res, 200, 'Report updated', { report });
});

module.exports = { createReport, getReports, updateReport };