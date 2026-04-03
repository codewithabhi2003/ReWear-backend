const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

// ─── Use memory storage — no multer-storage-cloudinary needed ─────────────────
// This bypasses the signing issue in multer-storage-cloudinary completely.
const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// ─── Helper: upload a single buffer to Cloudinary ────────────────────────────
const uploadToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    Readable.from(buffer).pipe(uploadStream);
  });
};

// ─── Middleware: upload product images (max 5) ────────────────────────────────
const uploadProductImages = (req, res, next) => {
  const upload = multer({
    storage:   memoryStorage,
    fileFilter,
    limits:    { fileSize: MAX_FILE_SIZE },
  }).array('images', 5);

  upload(req, res, async (err) => {
    if (err) return next(err);
    if (!req.files || req.files.length === 0) return next();

    try {
      const results = await Promise.all(
        req.files.map((f) => uploadToCloudinary(f.buffer, 'rewear/products'))
      );
      // Attach in same shape controllers expect
      req.files = results.map((r) => ({
        path:     r.secure_url,   // Cloudinary URL
        filename: r.public_id,    // Cloudinary public_id
      }));
      next();
    } catch (uploadErr) {
      console.error('❌ Cloudinary upload error:', uploadErr.message);
      next(new Error('Image upload failed: ' + uploadErr.message));
    }
  });
};

// ─── Middleware: upload single avatar ────────────────────────────────────────
const uploadAvatar = (req, res, next) => {
  const upload = multer({
    storage:   memoryStorage,
    fileFilter,
    limits:    { fileSize: MAX_FILE_SIZE },
  }).single('avatar');

  upload(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return next();

    try {
      const result = await uploadToCloudinary(req.file.buffer, 'rewear/avatars');
      req.file = { path: result.secure_url, filename: result.public_id };
      next();
    } catch (uploadErr) {
      next(new Error('Avatar upload failed: ' + uploadErr.message));
    }
  });
};

// ─── Middleware: upload review images (max 3) ─────────────────────────────────
const uploadReviewImages = (req, res, next) => {
  const upload = multer({
    storage:   memoryStorage,
    fileFilter,
    limits:    { fileSize: MAX_FILE_SIZE },
  }).array('images', 3);

  upload(req, res, async (err) => {
    if (err) return next(err);
    if (!req.files || req.files.length === 0) return next();

    try {
      const results = await Promise.all(
        req.files.map((f) => uploadToCloudinary(f.buffer, 'rewear/reviews'))
      );
      req.files = results.map((r) => ({
        path:     r.secure_url,
        filename: r.public_id,
      }));
      next();
    } catch (uploadErr) {
      next(new Error('Review image upload failed: ' + uploadErr.message));
    }
  });
};

module.exports = { uploadProductImages, uploadAvatar, uploadReviewImages };