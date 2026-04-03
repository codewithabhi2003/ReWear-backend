const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const getRazorpay = require('../config/razorpay');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const User = require('../models/User');
const { createNotification } = require('../services/notificationService');
const { sendResponse } = require('../utils/apiResponse');

// ─── POST /api/payment/create-order ──────────────────────────────────────────
const createRazorpayOrder = asyncHandler(async (req, res) => {
  const { productId, shippingAddress } = req.body;

  if (!productId || !shippingAddress) {
    res.status(400);
    throw new Error('Product ID and shipping address are required');
  }

  const product = await Product.findById(productId);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  if (product.status !== 'approved') {
    res.status(400);
    throw new Error('This product is no longer available');
  }
  if (product.sellerId.toString() === req.user._id.toString()) {
    res.status(400);
    throw new Error("You cannot buy your own product");
  }

  // Create Razorpay order (amount in paise)
  const razorpayOrder = await getRazorpay().orders.create({
    amount:   Math.round(product.sellingPrice * 100),
    currency: 'INR',
    receipt:  `rewear_${Date.now()}`,
  });

  // Create pending order in DB
  const order = await Order.create({
    buyerId:  req.user._id,
    sellerId: product.sellerId,
    productId,
    productSnapshot: {
      title:        product.title,
      brand:        product.brand,
      size:         product.size,
      condition:    product.condition,
      image:        product.images[0],
      sellingPrice: product.sellingPrice,
    },
    shippingAddress,
    payment: {
      razorpayOrderId: razorpayOrder.id,
      amount:          product.sellingPrice,
      status:          'pending',
    },
    statusHistory: [{ status: 'Payment Pending', note: 'Order initiated' }],
  });

  sendResponse(res, 201, 'Razorpay order created', {
    razorpayOrderId: razorpayOrder.id,
    orderId:         order._id,
    amount:          razorpayOrder.amount,   // paise
    currency:        'INR',
  });
});

// ─── POST /api/payment/verify ─────────────────────────────────────────────────
const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body;

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !orderId) {
    res.status(400);
    throw new Error('All payment verification fields are required');
  }

  // Verify HMAC signature
  const body             = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSignature !== razorpaySignature) {
    // Mark payment as failed
    await Order.findByIdAndUpdate(orderId, { 'payment.status': 'failed' });
    res.status(400);
    throw new Error('Payment verification failed — invalid signature');
  }

  // Fetch the order
  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Guard: already processed (handles double-submit / retry)
  if (order.payment.status === 'paid') {
    return sendResponse(res, 200, 'Payment already processed', { order });
  }

  // ── Atomic-ish: mark product sold first to prevent race conditions ───────
  const updatedProduct = await Product.findOneAndUpdate(
    { _id: order.productId, status: 'approved' }, // Only update if still approved
    { status: 'sold' },
    { new: true }
  );

  if (!updatedProduct) {
    // Product was bought by someone else between order creation and payment
    await Order.findByIdAndUpdate(orderId, {
      status:            'Cancelled',
      'payment.status':  'failed',
      $push: { statusHistory: { status: 'Cancelled', note: 'Product sold to another buyer' } },
    });
    res.status(409);
    throw new Error('This product was purchased by another buyer — your payment will be refunded');
  }

  // ── Update order ─────────────────────────────────────────────────────────
  const confirmedOrder = await Order.findByIdAndUpdate(
    orderId,
    {
      'payment.razorpayPaymentId': razorpayPaymentId,
      'payment.razorpaySignature': razorpaySignature,
      'payment.status':            'paid',
      'payment.paidAt':            new Date(),
      status:                      'Confirmed',
      $push: { statusHistory: { status: 'Confirmed', note: 'Payment verified successfully' } },
    },
    { new: true }
  );

  // ── Remove product from ALL carts ────────────────────────────────────────
  await Cart.updateMany({}, { $pull: { items: { productId: order.productId } } });

  // ── Update seller earnings ────────────────────────────────────────────────
  await User.findByIdAndUpdate(order.sellerId, {
    $inc: {
      'sellerStats.totalSold':   1,
      'sellerStats.totalEarned': order.payment.amount,
    },
  });

  // ── Notifications ─────────────────────────────────────────────────────────
  // Get io from app locals if available
  const io = req.app.get('io');

  await createNotification(
    order.buyerId,
    'order_confirmed',
    'Order Confirmed! 🎉',
    `Your order for ${order.productSnapshot.title} has been confirmed.`,
    `/orders/${order._id}`,
    io
  );

  await createNotification(
    order.sellerId,
    'new_order',
    'New Order Received! 📦',
    `Someone just bought your ${order.productSnapshot.title}!`,
    `/seller/orders`,
    io
  );

  sendResponse(res, 200, 'Payment verified — order confirmed!', { order: confirmedOrder });
});

module.exports = { createRazorpayOrder, verifyPayment };