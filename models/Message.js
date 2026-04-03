const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chatId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Chat',
    required: true,
    index:    true,
  },
  senderId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },

  // ── Text / media ───────────────────────────────────────────────────────────
  text:      { type: String, trim: true, default: '' },
  mediaUrl:  { type: String, default: '' },
  mediaType: { type: String, enum: ['image', 'video', ''], default: '' },
  isRead:    { type: Boolean, default: false },

  // ── Negotiation ────────────────────────────────────────────────────────────
  // type 'text' = normal message
  // type 'offer' = buyer's first offer
  // type 'counter_offer' = seller's counter
  // type 'offer_accepted' = either side accepted
  // type 'offer_declined' = either side declined
  type: {
    type:    String,
    enum:    ['text', 'offer', 'counter_offer', 'offer_accepted', 'offer_declined'],
    default: 'text',
  },

  // Populated only when type !== 'text'
  offer: {
    price:     { type: Number, default: 0 },
    basePrice: { type: Number, default: 0 },   // original product listing price
    discount:  { type: Number, default: 0 },   // percentage off basePrice
    status: {
      type:    String,
      enum:    ['pending', 'accepted', 'declined', 'countered'],
      default: 'pending',
    },
    // 1 = buyer's first offer, 2 = seller counter, 3 = buyer final
    round: { type: Number, default: 1 },
  },

  createdAt: { type: Date, default: Date.now },
});

messageSchema.index({ chatId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);