const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const { deleteImages } = require('../services/cloudinaryService');
const { sendResponse } = require('../utils/apiResponse');

// ─── GET /api/products ────────────────────────────────────────────────────────
const getProducts = asyncHandler(async (req, res) => {
  const {
    brand, category, gender, size, condition,
    priceMin, priceMax, sort,
    page = 1, limit = 20,
  } = req.query;

  const filter = { status: 'approved' };

  if (req.query.sellerId) filter.sellerId = req.query.sellerId;

  if (brand)     filter.brand     = { $in: brand.split(',').map((b) => new RegExp(b.trim(), 'i')) };
  if (category)  filter.category  = { $in: category.split(',') };
  if (gender)    filter.gender    = gender;
  if (size)      filter.size      = { $in: size.split(',') };
  if (condition) filter.condition = { $in: condition.split(',') };

  if (priceMin || priceMax) {
    filter.sellingPrice = {};
    if (priceMin) filter.sellingPrice.$gte = Number(priceMin);
    if (priceMax) filter.sellingPrice.$lte = Number(priceMax);
  }

  const sortOptions = {
    newest:      { createdAt: -1 },
    price_asc:   { sellingPrice: 1 },
    price_desc:  { sellingPrice: -1 },
    most_viewed: { views: -1 },
  };
  const sortBy = sortOptions[sort] || sortOptions.newest;

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Product.countDocuments(filter);

  const products = await Product.find(filter)
    .sort(sortBy)
    .skip(skip)
    .limit(Number(limit))
    .populate('sellerId', 'name avatar sellerStats');

  sendResponse(res, 200, 'Products fetched', {
    products,
    pagination: {
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
      limit: Number(limit),
    },
  });
});

// ─── GET /api/products/search ─────────────────────────────────────────────────
const searchProducts = asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 20 } = req.query;

  if (!q || !q.trim()) {
    res.status(400);
    throw new Error('Search query is required');
  }

  const filter = { status: 'approved', $text: { $search: q.trim() } };
  const skip   = (Number(page) - 1) * Number(limit);
  const total  = await Product.countDocuments(filter);

  const products = await Product.find(filter, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip)
    .limit(Number(limit))
    .populate('sellerId', 'name avatar sellerStats');

  sendResponse(res, 200, 'Search results fetched', {
    products,
    query: q,
    pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
  });
});

// ─── GET /api/products/seller/my-listings ────────────────────────────────────
const getMyListings = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = { sellerId: req.user._id };
  if (status) filter.status = status;

  const products = await Product.find(filter).sort({ createdAt: -1 });
  sendResponse(res, 200, 'Listings fetched', { products });
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('sellerId', 'name avatar sellerStats createdAt');

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  Product.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).exec();
  sendResponse(res, 200, 'Product fetched', { product });
});

// ─── POST /api/products ───────────────────────────────────────────────────────
const createProduct = asyncHandler(async (req, res) => {
  console.log('📦 Create product body:', req.body);
  console.log('📸 Files received:', req.files?.length, req.files?.map(f => ({ path: f.path, filename: f.filename, fieldname: f.fieldname })));

  const {
    title, description, brand, category, gender, size,
    condition, color, originalPrice, sellingPrice, tags,
  } = req.body;

  // Validate required fields manually for clearer errors
  const missing = [];
  if (!title)       missing.push('title');
  if (!brand)       missing.push('brand');
  if (!category)    missing.push('category');
  if (!gender)      missing.push('gender');
  if (!size)        missing.push('size');
  if (!condition)   missing.push('condition');
  if (!sellingPrice) missing.push('sellingPrice');

  if (missing.length) {
    res.status(400);
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error('At least one product image is required');
  }

  // multer-storage-cloudinary stores URL in .path and public_id in .filename
  const images        = req.files.map((f) => f.path);
  const cloudinaryIds = req.files.map((f) => f.filename);

  console.log('✅ Images mapped:', images);

  const tagsArray = tags
    ? tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const product = await Product.create({
    sellerId:      req.user._id,
    title:         title.trim(),
    description:   description ? description.trim() : '',
    brand:         brand.trim(),
    category,
    gender,
    size:          size.trim(),
    condition,
    color:         color ? color.trim() : '',
    originalPrice: originalPrice ? Number(originalPrice) : 0,
    sellingPrice:  Number(sellingPrice),
    images,
    cloudinaryIds,
    tags:          tagsArray,
    status:        'pending',
  });

  console.log('✅ Product created:', product._id);
  sendResponse(res, 201, 'Product listed successfully — pending admin review', { product });
});

// ─── PUT /api/products/:id ────────────────────────────────────────────────────
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  if (product.sellerId.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized — this is not your listing');
  }
  if (product.status === 'sold') {
    res.status(400);
    throw new Error('Cannot edit a sold product');
  }

  const allowedFields = [
    'title', 'description', 'brand', 'category', 'gender',
    'size', 'condition', 'color', 'originalPrice', 'sellingPrice', 'tags',
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) product[field] = req.body[field];
  });

  if (req.files && req.files.length > 0) {
    await deleteImages(product.cloudinaryIds);
    product.images        = req.files.map((f) => f.path);
    product.cloudinaryIds = req.files.map((f) => f.filename);
  }

  if (['approved', 'rejected'].includes(product.status)) {
    product.status    = 'pending';
    product.adminNote = '';
  }

  const updatedProduct = await product.save();
  sendResponse(res, 200, 'Product updated — resubmitted for review', { product: updatedProduct });
});

// ─── DELETE /api/products/:id ─────────────────────────────────────────────────
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  if (product.sellerId.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized — this is not your listing');
  }
  if (product.status === 'sold') {
    res.status(400);
    throw new Error('Cannot delete a sold product — order records depend on it');
  }

  await deleteImages(product.cloudinaryIds);
  await product.deleteOne();
  sendResponse(res, 200, 'Product deleted successfully');
});

module.exports = {
  getProducts, searchProducts, getMyListings,
  getProductById, createProduct, updateProduct, deleteProduct,
};