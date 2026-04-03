const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    unique: true,     // One review per order, enforced at DB level
    required: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rating: {
    type: Number,
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5'],
    required: [true, 'Rating is required'],
  },
  title: {
    type: String,
    trim: true,
    default: '',
  },
  comment: {
    type: String,
    trim: true,
    default: '',
  },
  images: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

reviewSchema.index({ sellerId: 1 });
reviewSchema.index({ productId: 1 });

module.exports = mongoose.model('Review', reviewSchema);
