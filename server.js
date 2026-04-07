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

// ── Root Route ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.status(200).json({ message: 'ReWear API is running 🚀' }));
app.head('/', (req, res) => res.sendStatus(200));
app.get('/favicon.ico', (req, res) => res.status(204).end());

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

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 ReWear server running on port ${PORT}`);
  console.log(`📡 Socket.io active`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
});
