const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const Order = require('../models/Order');
const User = require('../models/User');
const { sendResponse } = require('../utils/apiResponse');

// ─── POST /api/reviews ────────────────────────────────────────────────────────
const createReview = asyncHandler(async (req, res) => {
  const { orderId, rating, title, comment } = req.body;

  if (!orderId || !rating) {
    res.status(400);
    throw new Error('Order ID and rating are required');
  }

  const order = await Order.findById(orderId);

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Eligibility checks
  if (order.buyerId.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Only the buyer can review this order');
  }
  if (order.status !== 'Delivered') {
    res.status(400);
    throw new Error('You can only review after the order is delivered');
  }
  if (order.isReviewed) {
    res.status(400);
    throw new Error('You have already reviewed this order');
  }

  const images = req.files ? req.files.map((f) => f.path) : [];

  const review = await Review.create({
    orderId,
    productId: order.productId,
    buyerId:   req.user._id,
    sellerId:  order.sellerId,
    rating:    Number(rating),
    title,
    comment,
    images,
  });

  // Mark order as reviewed
  await Order.findByIdAndUpdate(orderId, { isReviewed: true });

  // Recalculate seller rating
  const allReviews = await Review.find({ sellerId: order.sellerId });
  const totalRatings = allReviews.length;
  const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / totalRatings;

  await User.findByIdAndUpdate(order.sellerId, {
    'sellerStats.rating':       Math.round(avgRating * 10) / 10,
    'sellerStats.totalRatings': totalRatings,
  });

  sendResponse(res, 201, 'Review submitted successfully', { review });
});

// ─── GET /api/reviews/product/:productId ─────────────────────────────────────
const getProductReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ productId: req.params.productId })
    .sort({ createdAt: -1 })
    .populate('buyerId', 'name avatar');

  sendResponse(res, 200, 'Product reviews fetched', { reviews });
});

// ─── GET /api/reviews/seller/:sellerId ───────────────────────────────────────
const getSellerReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ sellerId: req.params.sellerId })
    .sort({ createdAt: -1 })
    .populate('buyerId',  'name avatar')
    .populate('productId', 'title images');

  sendResponse(res, 200, 'Seller reviews fetched', { reviews });
});

module.exports = { createReview, getProductReviews, getSellerReviews };
