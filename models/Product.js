const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  brand: {
    type: String,
    required: [true, 'Brand is required'],
    trim: true,
  },
  category: {
    type: String,
    enum: ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Footwear', 'Accessories', 'Ethnic', 'Activewear'],
    required: true,
  },
  gender: {
    type: String,
    enum: ['men', 'women', 'unisex', 'kids'],
    required: true,
  },
  size: {
    type: String,
    required: [true, 'Size is required'],
  },
  condition: {
    type: String,
    enum: ['Brand New with Tags', 'Like New', 'Good', 'Fair'],
    required: true,
  },
  color: {
    type: String,
    default: '',
  },
  originalPrice: {
    type: Number,
    default: 0,
  },
  sellingPrice: {
    type: Number,
    required: [true, 'Selling price is required'],
    min: [1, 'Selling price must be at least ₹1'],
  },
  images: {
    type: [String],
    default: [],
  },
  cloudinaryIds: [String],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'sold', 'inactive'],
    default: 'pending',
  },
  adminNote: {
    type: String,
    default: '',
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
  views: {
    type: Number,
    default: 0,
  },
  wishlistCount: {
    type: Number,
    default: 0,
  },
  tags: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Text index for search
productSchema.index({ title: 'text', brand: 'text', tags: 'text', description: 'text' });

// Index for common filter queries
productSchema.index({ status: 1, category: 1, brand: 1, gender: 1 });
productSchema.index({ sellerId: 1, status: 1 });

module.exports = mongoose.model('Product', productSchema);