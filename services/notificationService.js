const Notification = require('../models/Notification');

/**
 * Create a notification and optionally emit it via Socket.io
 * @param {string} recipientId  - User ObjectId
 * @param {string} type         - Notification type enum
 * @param {string} title
 * @param {string} message
 * @param {string} link         - Frontend route
 * @param {object} io           - Socket.io instance (optional)
 */
const createNotification = async (recipientId, type, title, message, link = '/', io = null) => {
  try {
    const notification = await Notification.create({
      recipientId,
      type,
      title,
      message,
      link,
    });

    // Real-time push if socket instance provided
    if (io) {
      io.to(`user_${recipientId}`).emit('new_notification', {
        _id:         notification._id,
        type,
        title,
        message,
        link,
        isRead:      false,
        createdAt:   notification.createdAt,
      });
    }

    return notification;
  } catch (error) {
    // Notifications are non-critical — log but don't crash the main flow
    console.error('❌ Notification creation failed:', error.message);
    return null;
  }
};

module.exports = { createNotification };
