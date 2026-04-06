const express = require('express');
const { handleAIChat, uploadAIImage } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = express.Router();
router.post('/upload-image', protect, upload.single('image'), uploadAIImage);
router.post('/chat', protect, handleAIChat);
module.exports = router;