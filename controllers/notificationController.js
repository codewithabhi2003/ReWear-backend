const asyncHandler = require('express-async-handler');
const Notification = require('../models/Notification');
const { sendResponse } = require('../utils/apiResponse');

// ─── GET /api/notifications ───────────────────────────────────────────────────
const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ recipientId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  sendResponse(res, 200, 'Notifications fetched', { notifications });
});

// ─── GET /api/notifications/unread-count ─────────────────────────────────────
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    recipientId: req.user._id,
    isRead:      false,
  });

  sendResponse(res, 200, 'Unread count fetched', { count });
});

// ─── PUT /api/notifications/:id/read ─────────────────────────────────────────
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientId: req.user._id },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  sendResponse(res, 200, 'Notification marked as read', { notification });
});

// ─── PUT /api/notifications/mark-all-read ────────────────────────────────────
const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { recipientId: req.user._id, isRead: false },
    { isRead: true }
  );

  sendResponse(res, 200, 'All notifications marked as read');
});

module.exports = { getNotifications, getUnreadCount, markAsRead, markAllAsRead };
