const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { createNotification } = require('../services/notificationService');

module.exports = (io) => {
  // ── Auth middleware for socket connections ─────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error — no token'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error('Authentication error — invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: user ${socket.userId}`);

    // Join personal room for receiving direct notifications
    socket.join(`user_${socket.userId}`);

    // ── Join a chat room ─────────────────────────────────────────────────────
    socket.on('join_chat', (chatId) => {
      socket.join(`chat_${chatId}`);
    });

    // ── Leave a chat room ────────────────────────────────────────────────────
    socket.on('leave_chat', (chatId) => {
      socket.leave(`chat_${chatId}`);
    });

    // ── Send a message ────────────────────────────────────────────────────────
    socket.on('send_message', async ({ chatId, text }) => {
      if (!chatId || !text?.trim()) return;

      try {
        // Security: verify sender is a participant
        const chat = await Chat.findById(chatId);
        if (!chat) return;

        const isParticipant = chat.participants.some(
          (p) => p.toString() === socket.userId
        );
        if (!isParticipant) return;

        // Save message to DB
        const message = await Message.create({
          chatId,
          senderId: socket.userId,
          text:     text.trim(),
        });

        const populatedMessage = await Message.findById(message._id)
          .populate('senderId', 'name avatar');

        // Update chat's lastMessage + lastActivity
        await Chat.findByIdAndUpdate(chatId, {
          lastMessage:  message._id,
          lastActivity: new Date(),
        });

        // Broadcast to everyone in the chat room (including sender)
        io.to(`chat_${chatId}`).emit('receive_message', populatedMessage);

        // Notify the OTHER participant (not the sender)
        const recipientId = chat.participants.find(
          (p) => p.toString() !== socket.userId
        );

        if (recipientId) {
          // Real-time notification bubble
          io.to(`user_${recipientId}`).emit('new_message_notification', {
            chatId,
            senderId: socket.userId,
            preview:  text.substring(0, 60),
          });

          // Persist notification (pass io for real-time delivery)
          await createNotification(
            recipientId,
            'new_message',
            'New Message 💬',
            text.substring(0, 60),
            `/chat/${chatId}`,
            io
          );
        }
      } catch (err) {
        console.error('❌ send_message error:', err.message);
        socket.emit('message_error', { error: 'Failed to send message' });
      }
    });

    // ── Mark messages as read ─────────────────────────────────────────────────
    socket.on('mark_read', async ({ chatId }) => {
      try {
        await Message.updateMany(
          { chatId, senderId: { $ne: socket.userId }, isRead: false },
          { isRead: true }
        );
        // Notify sender their messages were read
        io.to(`chat_${chatId}`).emit('messages_read', { chatId, readBy: socket.userId });
      } catch (err) {
        console.error('❌ mark_read error:', err.message);
      }
    });

    // ── Typing indicator ──────────────────────────────────────────────────────
    socket.on('typing', ({ chatId }) => {
      socket.to(`chat_${chatId}`).emit('user_typing', {
        chatId,
        userId: socket.userId,
      });
    });

    socket.on('stop_typing', ({ chatId }) => {
      socket.to(`chat_${chatId}`).emit('user_stopped_typing', {
        chatId,
        userId: socket.userId,
      });
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: user ${socket.userId}`);
    });
  });
};
