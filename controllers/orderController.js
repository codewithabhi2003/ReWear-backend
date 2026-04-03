const asyncHandler = require('express-async-handler');
const Order        = require('../models/Order');
const getRazorpay  = require('../config/razorpay');
const { createNotification } = require('../services/notificationService');
const { sendResponse } = require('../utils/apiResponse');

// ─── GET /api/orders/my-orders ───────────────────────────────────────────────
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ buyerId: req.user._id })
    .sort({ createdAt: -1 })
    .populate('sellerId', 'name avatar');

  sendResponse(res, 200, 'Orders fetched', { orders });
});

// ─── GET /api/orders/seller-orders ───────────────────────────────────────────
const getSellerOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ sellerId: req.user._id })
    .sort({ createdAt: -1 })
    .populate('buyerId', 'name avatar phone');

  sendResponse(res, 200, 'Seller orders fetched', { orders });
});

// ─── GET /api/orders/:id ─────────────────────────────────────────────────────
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('buyerId',  'name avatar phone email')
    .populate('sellerId', 'name avatar phone');

  if (!order) { res.status(404); throw new Error('Order not found'); }

  const isOwner = [order.buyerId?._id, order.sellerId?._id]
    .some((id) => id?.toString() === req.user._id.toString());
  if (!isOwner) { res.status(403); throw new Error('Not authorized'); }

  sendResponse(res, 200, 'Order fetched', { order });
});

// ─── PUT /api/orders/:id/status ──────────────────────────────────────────────
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const order = await Order.findById(req.params.id);

  if (!order) { res.status(404); throw new Error('Order not found'); }

  if (order.sellerId.toString() !== req.user._id.toString()) {
    res.status(403); throw new Error('Only seller can update order status');
  }

  order.status = status;
  order.statusHistory.push({ status, note: note || '' });
  await order.save();

  const io = req.app.get('io');
  await createNotification(
    order.buyerId,
    'order_confirmed',
    `Order ${status}`,
    `Your order for ${order.productSnapshot.title} is now ${status}.`,
    `/orders/${order._id}`,
    io
  );

  sendResponse(res, 200, 'Status updated', { order });
});

// ─── PUT /api/orders/:id/cancel ──────────────────────────────────────────────
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) { res.status(404); throw new Error('Order not found'); }

  if (order.buyerId.toString() !== req.user._id.toString()) {
    res.status(403); throw new Error('Only buyer can cancel order');
  }
  if (!['Payment Pending', 'Confirmed'].includes(order.status)) {
    res.status(400); throw new Error('Cannot cancel order at this stage');
  }

  order.status = 'Cancelled';
  order.statusHistory.push({ status: 'Cancelled', note: 'Cancelled by buyer' });
  await order.save();

  // Re-list product
  const Product = require('../models/Product');
  await Product.findByIdAndUpdate(order.productId, { status: 'approved' });

  const io = req.app.get('io');
  await createNotification(
    order.sellerId,
    'new_order',
    'Order Cancelled',
    `Buyer cancelled the order for ${order.productSnapshot.title}.`,
    `/seller/orders`,
    io
  );

  sendResponse(res, 200, 'Order cancelled', { order });
});

// ─── POST /api/orders/from-chat ──────────────────────────────────────────────
// Creates a Razorpay order for a chat-negotiated price (no shipping address needed)
const createOrderFromChat = asyncHandler(async (req, res) => {
  const { chatId, agreedPrice, productId, shippingAddress } = req.body;

  if (!chatId || !agreedPrice || !productId) {
    res.status(400);
    throw new Error('chatId, agreedPrice and productId are required');
  }

  const parsedPrice = Number(agreedPrice);
  if (!parsedPrice || parsedPrice <= 0) {
    res.status(400); throw new Error('Invalid agreedPrice');
  }

  const Product = require('../models/Product');
  const Chat    = require('../models/Chat');

  const product = await Product.findById(productId);
  if (!product) { res.status(404); throw new Error('Product not found'); }

  if (product.status !== 'approved') {
    res.status(400); throw new Error('This product is no longer available');
  }
  if (product.sellerId.toString() === req.user._id.toString()) {
    res.status(400); throw new Error('You cannot buy your own product');
  }

  const chat = await Chat.findById(chatId);
  if (!chat) { res.status(404); throw new Error('Chat not found'); }

  const isParticipant = chat.participants.some(
    (p) => p.toString() === req.user._id.toString()
  );
  if (!isParticipant) { res.status(403); throw new Error('Not authorized'); }

  // Create Razorpay order at the NEGOTIATED price (not original sellingPrice)
  const rzpOrder = await getRazorpay().orders.create({
    amount:   Math.round(parsedPrice) * 100,   // paise
    currency: 'INR',
    receipt:  `chat_${chatId.toString().slice(-8)}_${Date.now()}`,
    notes: {
      chatId,
      negotiated: 'true',
      originalPrice: product.sellingPrice,
    },
  });

  // Persist the pending order using correct Order schema fields
  const order = await Order.create({
    buyerId:  req.user._id,
    sellerId: product.sellerId,
    productId,
    productSnapshot: {
      title:        product.title,
      brand:        product.brand || '',
      size:         product.size  || '',
      condition:    product.condition || '',
      image:        product.images?.[0] || '',
      sellingPrice: parsedPrice,   // record negotiated price as the sale price
    },
    // shippingAddress is optional — buyer and seller arrange delivery
    payment: {
      razorpayOrderId: rzpOrder.id,
      amount:          parsedPrice,
      status:          'pending',
    },
    status:        'Payment Pending',
    shippingAddress: shippingAddress || {},
    statusHistory: [{ status: 'Payment Pending', note: `Chat negotiated — agreed at ₹${parsedPrice}` }],
  });

  sendResponse(res, 201, 'Razorpay order created', {
    order: {
      _id:             order._id,
      razorpayOrderId: rzpOrder.id,
      amount:          rzpOrder.amount,   // in paise, for Razorpay SDK
      currency:        'INR',
    },
  });
});

module.exports = {
  getMyOrders,
  getSellerOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  createOrderFromChat,
};