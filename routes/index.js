const express = require('express');
const { protect } = require('../middleware/authMiddleware');

// ─── Order Router ─────────────────────────────────────────────────────────────
const orderRouter = express.Router();
const {
  getMyOrders,
  getSellerOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  createOrderFromChat,
} = require('../controllers/orderController');

orderRouter.get('/my-orders', protect, getMyOrders);
orderRouter.get('/seller-orders', protect, getSellerOrders);
orderRouter.post('/from-chat', protect, createOrderFromChat);
orderRouter.get('/:id', protect, getOrderById);
orderRouter.put('/:id/status', protect, updateOrderStatus);
orderRouter.put('/:id/cancel', protect, cancelOrder);

// ─── Payment Router ───────────────────────────────────────────────────────────
const paymentRouter = express.Router();
const { createRazorpayOrder, verifyPayment } = require('../controllers/paymentController');

paymentRouter.post('/create-order', protect, createRazorpayOrder);
paymentRouter.post('/verify', protect, verifyPayment);

// ─── Cart Router ──────────────────────────────────────────────────────────────
const cartRouter = express.Router();
const { getCart, addToCart, removeFromCart, clearCart } = require('../controllers/cartController');

cartRouter.get('/', protect, getCart);
cartRouter.post('/add', protect, addToCart);
cartRouter.delete('/remove/:productId', protect, removeFromCart);
cartRouter.delete('/clear', protect, clearCart);

// ─── Wishlist Router ──────────────────────────────────────────────────────────
const wishlistRouter = express.Router();
const { getWishlist, toggleWishlist } = require('../controllers/wishlistController');

wishlistRouter.get('/', protect, getWishlist);
wishlistRouter.post('/toggle/:productId', protect, toggleWishlist);

// ─── Chat Router ──────────────────────────────────────────────────────────────
const chatRouter = express.Router();
const {
  startChat,
  getMyChats,
  getChatMessages,
  sendOffer,
  respondToOffer,
  buyerRespondToCounter,
} = require('../controllers/chatController');

const { uploadProductImages: uploadChatMedia } = require('../middleware/uploadMiddleware');

chatRouter.post('/start', protect, startChat);
chatRouter.get('/my-chats', protect, getMyChats);
chatRouter.get('/:chatId/messages', protect, getChatMessages);
chatRouter.post('/:chatId/offer', protect, sendOffer);
chatRouter.post('/:chatId/offer/:msgId/respond', protect, respondToOffer);
chatRouter.post('/:chatId/offer/:msgId/buyer-respond', protect, buyerRespondToCounter);

chatRouter.post('/upload-media', protect, uploadChatMedia, (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  res.json({ success: true, data: { url: req.files[0].path } });
});

// ─── Review Router ────────────────────────────────────────────────────────────
const reviewRouter = express.Router();
const { createReview, getProductReviews, getSellerReviews } = require('../controllers/reviewController');
const { uploadReviewImages } = require('../middleware/uploadMiddleware');

reviewRouter.post('/', protect, uploadReviewImages, createReview);
reviewRouter.get('/product/:productId', getProductReviews);
reviewRouter.get('/seller/:sellerId', getSellerReviews);

// ─── Notification Router ──────────────────────────────────────────────────────
const notifRouter = express.Router();
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} = require('../controllers/notificationController');

notifRouter.get('/', protect, getNotifications);
notifRouter.get('/unread-count', protect, getUnreadCount);
notifRouter.put('/mark-all-read', protect, markAllAsRead);
notifRouter.put('/:id/read', protect, markAsRead);

// ─── Admin Router ─────────────────────────────────────────────────────────────
const adminRouter = express.Router();
const {
  getDashboardStats,
  getPendingProducts,
  approveProduct,
  rejectProduct,
  getAllUsers,
  blockUser,
  unblockUser,
  getAllOrders,
} = require('../controllers/adminController');

const { adminOnly } = require('../middleware/adminMiddleware'); // ✅ ONLY HERE

adminRouter.use(protect, adminOnly);

adminRouter.get('/dashboard-stats', getDashboardStats);
adminRouter.get('/products/pending', getPendingProducts);
adminRouter.put('/products/:id/approve', approveProduct);
adminRouter.put('/products/:id/reject', rejectProduct);
adminRouter.get('/users', getAllUsers);
adminRouter.put('/users/:id/block', blockUser);
adminRouter.put('/users/:id/unblock', unblockUser);
adminRouter.get('/orders', getAllOrders);

// ─── Report Router ───────────────────────────────────────────────────────────
const reportRouter = express.Router();
const { createReport, getReports, updateReport } = require('../controllers/reportController');

// ❌ REMOVED duplicate adminOnly import

reportRouter.post('/', protect, createReport);
reportRouter.get('/', protect, adminOnly, getReports);
reportRouter.put('/:id', protect, adminOnly, updateReport);

// ─── Export ──────────────────────────────────────────────────────────────────
module.exports = {
  orderRouter,
  paymentRouter,
  cartRouter,
  wishlistRouter,
  chatRouter,
  reviewRouter,
  notifRouter,
  adminRouter,
  reportRouter,
};