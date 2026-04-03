const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { sendResponse } = require('../utils/apiResponse');

// ─── POST /api/auth/register ──────────────────────────────────────────────────
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Name, email, and password are required');
  }

  if (password.length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }

  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    res.status(400);
    throw new Error('An account with this email already exists');
  }

  const user = await User.create({ name: name.trim(), email, password });

  const token = generateToken(user._id);

  sendResponse(res, 201, 'Account created successfully', {
    token,
    user: {
      _id:         user._id,
      name:        user.name,
      email:       user.email,
      avatar:      user.avatar,
      role:        user.role,
      sellerStats: user.sellerStats,
      createdAt:   user.createdAt,
    },
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error('Email and password are required');
  }

  // Explicitly select password (it's select: false in schema)
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

  if (!user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  if (user.isBlocked) {
    res.status(401);
    throw new Error('Your account has been suspended. Please contact support.');
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  const token = generateToken(user._id);

  sendResponse(res, 200, 'Login successful', {
    token,
    user: {
      _id:         user._id,
      name:        user.name,
      email:       user.email,
      avatar:      user.avatar,
      phone:       user.phone,
      address:     user.address,
      role:        user.role,
      sellerStats: user.sellerStats,
      createdAt:   user.createdAt,
    },
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  // req.user is populated by protect middleware (fresh from DB)
  sendResponse(res, 200, 'User fetched', {
    user: {
      _id:         req.user._id,
      name:        req.user.name,
      email:       req.user.email,
      avatar:      req.user.avatar,
      phone:       req.user.phone,
      address:     req.user.address,
      role:        req.user.role,
      sellerStats: req.user.sellerStats,
      createdAt:   req.user.createdAt,
    },
  });
});

module.exports = { register, login, getMe };
