const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, getSellerProfile } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { uploadAvatar } = require('../middleware/uploadMiddleware');

router.get('/profile',         protect, getProfile);
router.put('/profile',         protect, uploadAvatar, updateProfile);
router.get('/seller/:id',      getSellerProfile); // public

module.exports = router;
