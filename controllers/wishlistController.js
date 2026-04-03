const asyncHandler = require('express-async-handler');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const { sendResponse } = require('../utils/apiResponse');

// ─── GET /api/wishlist ────────────────────────────────────────────────────────
const getWishlist = asyncHandler(async (req, res) => {
  let wishlist = await Wishlist.findOne({ userId: req.user._id }).populate({
    path:   'products',
    select: 'title brand size condition images sellingPrice originalPrice status sellerId',
    populate: { path: 'sellerId', select: 'name avatar' },
  });

  if (!wishlist) {
    wishlist = await Wishlist.create({ userId: req.user._id, products: [] });
  }

  sendResponse(res, 200, 'Wishlist fetched', { products: wishlist.products });
});

// ─── POST /api/wishlist/toggle/:productId ─────────────────────────────────────
const toggleWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const product = await Product.findById(productId);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  let wishlist = await Wishlist.findOne({ userId: req.user._id });
  if (!wishlist) {
    wishlist = await Wishlist.create({ userId: req.user._id, products: [] });
  }

  const index = wishlist.products.findIndex((p) => p.toString() === productId);
  let action;

  if (index === -1) {
    // Add to wishlist
    wishlist.products.push(productId);
    await Product.findByIdAndUpdate(productId, { $inc: { wishlistCount: 1 } });
    action = 'added';
  } else {
    // Remove from wishlist
    wishlist.products.splice(index, 1);
    await Product.findByIdAndUpdate(productId, { $inc: { wishlistCount: -1 } });
    action = 'removed';
  }

  await wishlist.save();

  sendResponse(res, 200, `Product ${action} ${action === 'added' ? 'to' : 'from'} wishlist`, {
    action,
    productId,
    wishlistCount: wishlist.products.length,
  });
});

module.exports = { getWishlist, toggleWishlist };
