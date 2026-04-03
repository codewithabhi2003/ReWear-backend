const express = require('express');
const router = express.Router();
const {
  getProducts, searchProducts, getMyListings,
  getProductById, createProduct, updateProduct, deleteProduct,
} = require('../controllers/productController');
const { protect } = require('../middleware/authMiddleware');
const { uploadProductImages } = require('../middleware/uploadMiddleware');

// Must come before /:id to avoid route collision
router.get('/search',           searchProducts);
router.get('/seller/my-listings', protect, getMyListings);

router.get('/',     getProducts);
router.get('/:id',  getProductById);
router.post('/',    protect, uploadProductImages, createProduct);
router.put('/:id',  protect, uploadProductImages, updateProduct);
router.delete('/:id', protect, deleteProduct);

module.exports = router;
