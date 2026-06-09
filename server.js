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
const aiRoutes = require('./routes/aiRoutes');
 
// ── Connect to MongoDB ────────────────────────────────────────────────────────
connectDB();
 
const app        = express();
const httpServer = http.createServer(app);
 
// ── Allowed origins ───────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://rewear-dusky.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];
 
// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 60000,
});
 
app.set('io', io);
require('./socket/chatSocket')(io);
 
// ── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
 
// ── Health Check Status ────────────────────────────────────────────────────────
let serverHealthy = true;
 
// ── Root Route ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'ReWear API is running 🚀',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});
 
app.head('/', (req, res) => res.sendStatus(200));
 
app.get('/favicon.ico', (req, res) => res.status(204).end());
 
// ── HEALTH CHECK ENDPOINT (Keep-Alive) ─────────────────────────────────────────
// This endpoint is pinged every 8 minutes by GitHub Actions to keep backend awake
app.get('/health', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Return health status
    res.status(200).json({
      status: 'healthy',
      service: 'ReWear Backend',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'production',
      database: mongoStatus,
      socket_io: 'active',
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      },
      server: serverHealthy ? 'running' : 'degraded'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'ReWear Backend',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
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
app.use('/api/ai',            aiRoutes);
 
// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.status(404);
  next(new Error(`Route not found: ${req.method} ${req.originalUrl}`));
});
 
// ── Error Handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);
 
// ── Socket.IO Connection Handler ──────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket.IO] ✅ User connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`[Socket.IO] ❌ User disconnected: ${socket.id}`);
  });
  
  socket.on('error', (error) => {
    console.error(`[Socket.IO] ⚠️ Error for ${socket.id}:`, error);
  });
});
 
// ── Graceful Shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('📢 SIGTERM signal received: closing HTTP server');
  serverHealthy = false;
  
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
});
 
// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 ReWear Server Started`);
  console.log(`${'='.repeat(60)}`);
  console.log(`🌐 Port: ${PORT}`);
  console.log(`📡 Socket.IO: Active`);
  console.log(`🗄️  Database: Connecting...`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`💚 Health Check: GET /health`);
  console.log(`${'='.repeat(60)}\n`);
});
 
// ── Handle Uncaught Exceptions ────────────────────────────────────────────────
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  serverHealthy = false;
  process.exit(1);
});
 
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  serverHealthy = false;
});
 
module.exports = httpServer;