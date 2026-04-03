const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { deleteImage } = require('../services/cloudinaryService');
const { sendResponse } = require('../utils/apiResponse');

// ─── GET /api/users/profile ───────────────────────────────────────────────────
const getProfile = asyncHandler(async (req, res) => {
  sendResponse(res, 200, 'Profile fetched', { user: req.user });
});

// ─── PUT /api/users/profile ───────────────────────────────────────────────────
const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  const { name, phone, street, city, state, pincode } = req.body;

  if (name)    user.name         = name.trim();
  if (phone)   user.phone        = phone.trim();
  if (street)  user.address.street  = street.trim();
  if (city)    user.address.city    = city.trim();
  if (state)   user.address.state   = state.trim();
  if (pincode) user.address.pincode = pincode.trim();

  // Handle avatar upload (via uploadAvatar middleware)
  if (req.file) {
    // Delete old avatar from Cloudinary if it exists
    if (user.avatarPublicId) {
      await deleteImage(user.avatarPublicId);
    }
    user.avatar          = req.file.path;          // Cloudinary URL
    user.avatarPublicId  = req.file.filename;      // Cloudinary public_id
  }

  const updatedUser = await user.save();

  sendResponse(res, 200, 'Profile updated successfully', {
    user: {
      _id:         updatedUser._id,
      name:        updatedUser.name,
      email:       updatedUser.email,
      avatar:      updatedUser.avatar,
      phone:       updatedUser.phone,
      address:     updatedUser.address,
      role:        updatedUser.role,
      sellerStats: updatedUser.sellerStats,
    },
  });
});

// ─── GET /api/users/seller/:id ────────────────────────────────────────────────
// Public seller profile — visible to any visitor
const getSellerProfile = asyncHandler(async (req, res) => {
  const seller = await User.findById(req.params.id).select(
    'name avatar sellerStats createdAt'
  );

  if (!seller) {
    res.status(404);
    throw new Error('Seller not found');
  }

  if (seller.isBlocked) {
    res.status(404);
    throw new Error('Seller not found');
  }

  sendResponse(res, 200, 'Seller profile fetched', { seller });
});

module.exports = { getProfile, updateProfile, getSellerProfile };
