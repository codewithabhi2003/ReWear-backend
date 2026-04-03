const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  lastActivity: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure no duplicate chats for the same buyer+seller+product combo
chatSchema.index({ participants: 1, productId: 1 });

module.exports = mongoose.model('Chat', chatSchema);
