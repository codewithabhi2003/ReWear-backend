const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reportedBy: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },
  // What is being reported
  targetType: {
    type:     String,
    enum:     ['product', 'seller', 'feedback'],
    required: true,
  },
  targetId: {
    type:     String,   // String not ObjectId — supports 'general'/'feedback' for non-product reports
    default:  'general',
  },
  // Snapshot so admin sees it even if item is deleted
  targetSnapshot: {
    title:  String,   // product title OR seller name
    image:  String,
    url:    String,
  },
  reason: {
    type:     String,
    enum:     [
      // ── report reasons ──────────────────────────────
      'Counterfeit / Fake item',
      'Misleading description',
      'Wrong / missing images',
      'Inappropriate content',
      'Spam or scam',
      'Price gouging',
      'Harassment by seller',
      'Other',
      // ── feedback types (targetType === 'feedback') ──
      'suggestion',
      'bug',
      'compliment',
      'other',
    ],
    required: true,
  },
  details: {
    type:    String,
    maxlength: 500,
    default: '',
  },
  status: {
    type:    String,
    enum:    ['pending', 'reviewed', 'resolved', 'dismissed'],
    default: 'pending',
  },
  adminNote: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

reportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);