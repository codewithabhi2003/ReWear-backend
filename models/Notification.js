const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: [
      'order_placed',
      'order_confirmed',
      'order_packed',
      'order_shipped',
      'order_delivered',
      'new_order',
      'product_approved',
      'product_rejected',
      'new_message',
      'wishlist_price_drop',
    ],
    required: true,
  },
  title:   { type: String, required: true },
  message: { type: String, required: true },
  link:    { type: String, default: '/' },
  isRead:  { type: Boolean, default: false },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
