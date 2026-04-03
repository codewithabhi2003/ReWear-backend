require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const connectDB  = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes    = require('./routes/authRoutes');
const userRoutes    = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const {
  orderRouter, paymentRouter, cartRouter, wishlistRouter,
  chatRouter,  reviewRouter,  notifRouter, adminRouter, reportRouter,
} = require('./routes/index');

// ── Connect to MongoDB ────────────────────────────────────────────────────────
connectDB();

const app        = express();
const httpServer = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin:  process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// Make io accessible in controllers via req.app.get('io')
app.set('io', io);

// Attach chat socket handler
require('./socket/chatSocket')(io);

// ── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/products',      productRoutes);
app.use('/api/orders',        orderRouter);
app.use('/api/payment',       paymentRouter);
app.use('/api/cart',          cartRouter);
app.use('/api/wishlist',      wishlistRouter);
app.use('/api/chat',          chatRouter);
app.use('/api/reviews',       reviewRouter);
app.use('/api/notifications', notifRouter);
app.use('/api/admin',         adminRouter);
app.use('/api/reports',       reportRouter);

// ── 404 catch ─────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.status(404);
  next(new Error(`Route not found: ${req.method} ${req.originalUrl}`));
});

// ── Global Error Handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 ReWear server running on port ${PORT}`);
  console.log(`📡 Socket.io active`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}\n`);
});