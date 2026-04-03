const asyncHandler = require('express-async-handler');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { sendResponse } = require('../utils/apiResponse');

// ─── GET /api/cart ────────────────────────────────────────────────────────────
const getCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ userId: req.user._id })
    .populate({
      path:   'items.productId',
      select: 'title brand size condition images sellingPrice originalPrice status sellerId',
      populate: { path: 'sellerId', select: 'name avatar' },
    });

  if (!cart) {
    cart = await Cart.create({ userId: req.user._id, items: [] });
  }

  // Filter out null products (deleted) and mark sold items
  const validItems = cart.items.filter((item) => item.productId !== null);

  sendResponse(res, 200, 'Cart fetched', { items: validItems });
});

// ─── POST /api/cart/add ───────────────────────────────────────────────────────
const addToCart = asyncHandler(async (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    res.status(400);
    throw new Error('Product ID is required');
  }

  const product = await Product.findById(productId);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  if (product.status !== 'approved') {
    res.status(400);
    throw new Error('This product is not available');
  }
  if (product.sellerId.toString() === req.user._id.toString()) {
    res.status(400);
    throw new Error("You can't add your own listing to cart");
  }

  let cart = await Cart.findOne({ userId: req.user._id });
  if (!cart) {
    cart = await Cart.create({ userId: req.user._id, items: [] });
  }

  const alreadyInCart = cart.items.some(
    (item) => item.productId.toString() === productId
  );
  if (alreadyInCart) {
    return sendResponse(res, 200, 'Item already in cart', { cart });
  }

  cart.items.push({ productId });
  await cart.save();

  sendResponse(res, 200, 'Added to cart', { cart });
});

// ─── DELETE /api/cart/remove/:productId ──────────────────────────────────────
const removeFromCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ userId: req.user._id });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  cart.items = cart.items.filter(
    (item) => item.productId.toString() !== req.params.productId
  );
  await cart.save();

  sendResponse(res, 200, 'Item removed from cart', { cart });
});

// ─── DELETE /api/cart/clear ───────────────────────────────────────────────────
const clearCart = asyncHandler(async (req, res) => {
  await Cart.findOneAndUpdate({ userId: req.user._id }, { items: [] });
  sendResponse(res, 200, 'Cart cleared');
});

module.exports = { getCart, addToCart, removeFromCart, clearCart };
