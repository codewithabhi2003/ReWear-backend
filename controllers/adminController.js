const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { createNotification } = require('../services/notificationService');
const { sendResponse } = require('../utils/apiResponse');

// ─── GET /api/admin/dashboard-stats ──────────────────────────────────────────
const getDashboardStats = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalProducts,
    pendingProducts,
    totalOrders,
    revenueResult,
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Product.countDocuments(),
    Product.countDocuments({ status: 'pending' }),
    Order.countDocuments(),
    Order.aggregate([
      { $match: { 'payment.status': 'paid' } },
      { $group: { _id: null, total: { $sum: '$payment.amount' } } },
    ]),
  ]);

  const totalRevenue = revenueResult[0]?.total || 0;

  sendResponse(res, 200, 'Dashboard stats fetched', {
    totalUsers,
    totalProducts,
    pendingProducts,
    totalOrders,
    totalRevenue,
  });
});

// ─── GET /api/admin/products/pending ─────────────────────────────────────────
const getPendingProducts = asyncHandler(async (req, res) => {
  const { status = 'pending', page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = {};
  if (status !== 'all') filter.status = status;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('sellerId', 'name email avatar sellerStats'),
    Product.countDocuments(filter),
  ]);

  sendResponse(res, 200, 'Products fetched', {
    products,
    pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
  });
});

// ─── PUT /api/admin/products/:id/approve ─────────────────────────────────────
const approveProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  product.status    = 'approved';
  product.adminNote = '';
  await product.save();

  const io = req.app.get('io');
  await createNotification(
    product.sellerId,
    'product_approved',
    'Listing Approved! 🎉',
    `Your listing "${product.title}" is now live on ReWear.`,
    `/seller/listings`,
    io
  );

  sendResponse(res, 200, 'Product approved', { product });
});

// ─── PUT /api/admin/products/:id/reject ──────────────────────────────────────
const rejectProduct = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    res.status(400);
    throw new Error('Rejection reason is required');
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  product.status    = 'rejected';
  product.adminNote = reason.trim();
  await product.save();

  const io = req.app.get('io');
  await createNotification(
    product.sellerId,
    'product_rejected',
    'Listing Not Approved',
    `Your listing "${product.title}" was not approved. Reason: ${reason}`,
    `/seller/listings`,
    io
  );

  sendResponse(res, 200, 'Product rejected', { product });
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = { role: 'user' };
  if (search) {
    filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  sendResponse(res, 200, 'Users fetched', {
    users,
    pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
  });
});

// ─── PUT /api/admin/users/:id/block ──────────────────────────────────────────
const blockUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (user.role === 'admin') {
    res.status(400);
    throw new Error('Cannot block an admin account');
  }

  user.isBlocked = true;
  await user.save();

  sendResponse(res, 200, 'User blocked', { userId: user._id });
});

// ─── PUT /api/admin/users/:id/unblock ────────────────────────────────────────
const unblockUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isBlocked: false },
    { new: true }
  ).select('-password');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  sendResponse(res, 200, 'User unblocked', { user });
});

// ─── GET /api/admin/orders ────────────────────────────────────────────────────
const getAllOrders = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = {};
  if (status) filter.status = status;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('buyerId',  'name email avatar')
      .populate('sellerId', 'name email avatar'),
    Order.countDocuments(filter),
  ]);

  sendResponse(res, 200, 'Orders fetched', {
    orders,
    pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
  });
});

module.exports = {
  getDashboardStats,
  getPendingProducts,
  approveProduct,
  rejectProduct,
  getAllUsers,
  blockUser,
  unblockUser,
  getAllOrders,
};
