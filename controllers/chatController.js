const asyncHandler = require('express-async-handler');
const Chat         = require('../models/Chat');
const Message      = require('../models/Message');
const Product      = require('../models/Product');
const { sendResponse } = require('../utils/apiResponse');

// ─── Helper: broadcast new message + notification badge ───────────────────
const broadcast = async (req, chatId, message, recipientId) => {
  const io = req.app.get('io');
  if (!io) return;
  // Send full message to chat room
  io.to(`chat_${chatId}`).emit('receive_message', message);
  // Increment badge for the OTHER participant
  if (recipientId) {
    io.to(`user_${recipientId.toString()}`).emit('new_message_notification', {
      chatId:  chatId.toString(),
      senderId: message.senderId?._id?.toString() || message.senderId?.toString(),
      preview: message.text?.substring(0, 60) || '',
    });
  }
};

// ─── Helper: get the other participant's id from a chat ───────────────────
const getRecipient = (chat, senderId) =>
  chat.participants.find((p) => p.toString() !== senderId.toString());

// ─── POST /api/chat/start ─────────────────────────────────────────────────────
const startChat = asyncHandler(async (req, res) => {
  const { productId } = req.body;
  if (!productId) { res.status(400); throw new Error('productId is required'); }

  const product = await Product.findById(productId).populate('sellerId', 'name avatar');
  if (!product)  { res.status(404); throw new Error('Product not found'); }

  if (product.sellerId._id.toString() === req.user._id.toString()) {
    res.status(400); throw new Error("You can't chat about your own listing");
  }

  const buyerId  = req.user._id;
  const sellerId = product.sellerId._id;

  let chat = await Chat.findOne({
    productId,
    participants: { $all: [buyerId, sellerId] },
  })
    .populate('participants', 'name avatar')
    .populate('productId',   'title images brand status sellingPrice');

  if (!chat) {
    chat = await Chat.create({ participants: [buyerId, sellerId], productId });
    chat = await Chat.findById(chat._id)
      .populate('participants', 'name avatar')
      .populate('productId',   'title images brand status sellingPrice');
  }

  sendResponse(res, 200, 'Chat ready', { chat });
});

// ─── GET /api/chat/my-chats ───────────────────────────────────────────────────
const getMyChats = asyncHandler(async (req, res) => {
  const chats = await Chat.find({ participants: req.user._id })
    .sort({ lastActivity: -1 })
    .populate('participants',  'name avatar')
    .populate('productId',     'title images brand status sellingPrice')
    .populate({
      path:   'lastMessage',
      select: 'text senderId isRead createdAt type offer',
    });

  const chatsWithUnread = await Promise.all(
    chats.map(async (chat) => {
      const unread = await Message.countDocuments({
        chatId:   chat._id,
        senderId: { $ne: req.user._id },
        isRead:   false,
      });
      return { ...chat.toObject(), unreadCount: unread };
    })
  );

  sendResponse(res, 200, 'Chats fetched', { chats: chatsWithUnread });
});

// ─── GET /api/chat/:chatId/messages ──────────────────────────────────────────
const getChatMessages = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.chatId)
    .populate('productId', 'title sellingPrice images brand sellerId');

  if (!chat) { res.status(404); throw new Error('Chat not found'); }

  const isParticipant = chat.participants.some(
    (p) => p.toString() === req.user._id.toString()
  );
  if (!isParticipant) { res.status(403); throw new Error('Not authorized'); }

  const { page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const messages = await Message.find({ chatId: req.params.chatId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate('senderId', 'name avatar');

  // Mark incoming as read
  await Message.updateMany(
    { chatId: req.params.chatId, senderId: { $ne: req.user._id }, isRead: false },
    { isRead: true }
  );

  sendResponse(res, 200, 'Messages fetched', {
    messages: messages.reverse(),
    page:     Number(page),
    product:  chat.productId,   // send product so frontend can use it
  });
});

// ─── POST /api/chat/:chatId/offer ─────────────────────────────────────────────
// Buyer sends a price offer
const sendOffer = asyncHandler(async (req, res) => {
  const { offerPrice } = req.body;

  // Validate input
  const parsedPrice = Number(offerPrice);
  if (!parsedPrice || parsedPrice <= 0) {
    res.status(400); throw new Error('Valid offer price is required');
  }

  const chat = await Chat.findById(req.params.chatId)
    .populate('productId', 'title sellingPrice images sellerId');

  if (!chat) { res.status(404); throw new Error('Chat not found'); }

  const isParticipant = chat.participants.some(
    (p) => p.toString() === req.user._id.toString()
  );
  if (!isParticipant) { res.status(403); throw new Error('Not authorized'); }

  // Only buyer can send initial offer
  const sellerId = chat.productId.sellerId?.toString?.() || chat.productId.sellerId?.toString();
  if (req.user._id.toString() === sellerId) {
    res.status(400); throw new Error('Seller cannot make an offer on their own product');
  }

  const basePrice = chat.productId.sellingPrice;

  if (parsedPrice >= basePrice) {
    res.status(400); throw new Error(`Offer must be less than listing price ₹${basePrice}`);
  }
  if (parsedPrice < basePrice * 0.30) {
    res.status(400); throw new Error('Offer too low — minimum 30% of listing price');
  }

  const discount = Math.round(((basePrice - parsedPrice) / basePrice) * 100);

  // Cancel any currently pending offers so there's only one active
  await Message.updateMany(
    { chatId: chat._id, 'offer.status': 'pending' },
    { $set: { 'offer.status': 'declined' } }
  );

  const msg = await Message.create({
    chatId:   chat._id,
    senderId: req.user._id,
    type:     'offer',
    text:     `💬 Offered ₹${parsedPrice.toLocaleString('en-IN')} (${discount}% off)`,
    offer: {
      price:     parsedPrice,
      basePrice: basePrice,
      discount:  discount,
      status:    'pending',
      round:     1,
    },
  });

  await Chat.findByIdAndUpdate(chat._id, {
    lastMessage:  msg._id,
    lastActivity: new Date(),
  });

  const populated = await msg.populate('senderId', 'name avatar');
  await broadcast(req, chat._id, populated, getRecipient(chat, req.user._id));

  sendResponse(res, 201, 'Offer sent', { message: populated });
});

// ─── POST /api/chat/:chatId/offer/:msgId/respond ──────────────────────────────
// Seller responds: accept | decline | counter
const respondToOffer = asyncHandler(async (req, res) => {
  const { action, counterPrice } = req.body;

  if (!['accept', 'decline', 'counter'].includes(action)) {
    res.status(400); throw new Error('action must be accept, decline, or counter');
  }

  const chat = await Chat.findById(req.params.chatId)
    .populate('productId', 'title sellingPrice sellerId');

  if (!chat) { res.status(404); throw new Error('Chat not found'); }

  const sellerId = (chat.productId.sellerId?._id || chat.productId.sellerId)?.toString();
  if (req.user._id.toString() !== sellerId) {
    res.status(403); throw new Error('Only the seller can respond to offers');
  }

  const offerMsg = await Message.findOne({
    _id:    req.params.msgId,
    chatId: chat._id,
    type:   { $in: ['offer', 'counter_offer'] },
  });

  if (!offerMsg) { res.status(404); throw new Error('Offer not found'); }
  if (offerMsg.offer.status !== 'pending') {
    res.status(400); throw new Error('This offer is no longer active');
  }

  let replyMsg;

  if (action === 'accept') {
    await Message.findByIdAndUpdate(offerMsg._id, { $set: { 'offer.status': 'accepted' } });
    replyMsg = await Message.create({
      chatId:   chat._id,
      senderId: req.user._id,
      type:     'offer_accepted',
      text:     `✅ Deal! Accepted your offer of ₹${offerMsg.offer.price.toLocaleString('en-IN')}. Tap Pay Now to complete your purchase.`,
      offer: {
        price:     offerMsg.offer.price,
        basePrice: offerMsg.offer.basePrice,
        discount:  offerMsg.offer.discount,
        status:    'accepted',
        round:     offerMsg.offer.round,
      },
    });

  } else if (action === 'decline') {
    await Message.findByIdAndUpdate(offerMsg._id, { $set: { 'offer.status': 'declined' } });
    replyMsg = await Message.create({
      chatId:   chat._id,
      senderId: req.user._id,
      type:     'offer_declined',
      text:     `❌ Sorry, I can't accept that price. The item is still available at ₹${offerMsg.offer.basePrice.toLocaleString('en-IN')}.`,
      offer: {
        price:     offerMsg.offer.basePrice,
        basePrice: offerMsg.offer.basePrice,
        discount:  0,
        status:    'declined',
        round:     offerMsg.offer.round,
      },
    });

  } else if (action === 'counter') {
    if (offerMsg.offer.round >= 2) {
      res.status(400); throw new Error('Maximum 2 rounds of negotiation reached. Please accept or decline.');
    }
    const cp = Number(counterPrice);
    if (!cp || cp <= offerMsg.offer.price) {
      res.status(400); throw new Error('Counter price must be higher than the buyer\'s offer');
    }
    if (cp >= offerMsg.offer.basePrice) {
      res.status(400); throw new Error('Counter price must be less than the original listing price');
    }

    const discount = Math.round(((offerMsg.offer.basePrice - cp) / offerMsg.offer.basePrice) * 100);

    await Message.findByIdAndUpdate(offerMsg._id, { $set: { 'offer.status': 'countered' } });
    replyMsg = await Message.create({
      chatId:   chat._id,
      senderId: req.user._id,
      type:     'counter_offer',
      text:     `↕️ I can do ₹${cp.toLocaleString('en-IN')} (${discount}% off the listed price). What do you say?`,
      offer: {
        price:     cp,
        basePrice: offerMsg.offer.basePrice,
        discount:  discount,
        status:    'pending',
        round:     offerMsg.offer.round + 1,
      },
    });
  }

  await Chat.findByIdAndUpdate(chat._id, {
    lastMessage:  replyMsg._id,
    lastActivity: new Date(),
  });

  const populated = await replyMsg.populate('senderId', 'name avatar');
  await broadcast(req, chat._id, populated, getRecipient(chat, req.user._id));

  sendResponse(res, 200, 'Response sent', { message: populated });
});

// ─── POST /api/chat/:chatId/offer/:msgId/buyer-respond ────────────────────────
// Buyer responds to a seller's counter offer: accept | decline
const buyerRespondToCounter = asyncHandler(async (req, res) => {
  const { action } = req.body;

  if (!['accept', 'decline'].includes(action)) {
    res.status(400); throw new Error('action must be accept or decline');
  }

  const chat = await Chat.findById(req.params.chatId)
    .populate('productId', 'title sellingPrice sellerId');

  if (!chat) { res.status(404); throw new Error('Chat not found'); }

  const sellerId = (chat.productId.sellerId?._id || chat.productId.sellerId)?.toString();

  // Must be a participant but NOT the seller
  const isParticipant = chat.participants.some(
    (p) => p.toString() === req.user._id.toString()
  );
  if (!isParticipant) { res.status(403); throw new Error('Not authorized'); }
  if (req.user._id.toString() === sellerId) {
    res.status(403); throw new Error('Seller cannot respond to their own counter offer');
  }

  const counterMsg = await Message.findOne({
    _id:    req.params.msgId,
    chatId: chat._id,
    type:   'counter_offer',
  });

  if (!counterMsg) { res.status(404); throw new Error('Counter offer not found'); }
  if (counterMsg.offer.status !== 'pending') {
    res.status(400); throw new Error('This counter offer is no longer active');
  }

  let replyMsg;

  if (action === 'accept') {
    await Message.findByIdAndUpdate(counterMsg._id, { $set: { 'offer.status': 'accepted' } });
    replyMsg = await Message.create({
      chatId:   chat._id,
      senderId: req.user._id,
      type:     'offer_accepted',
      text:     `✅ Deal! I accept ₹${counterMsg.offer.price.toLocaleString('en-IN')}. Proceeding to payment.`,
      offer: {
        price:     counterMsg.offer.price,
        basePrice: counterMsg.offer.basePrice,
        discount:  counterMsg.offer.discount,
        status:    'accepted',
        round:     counterMsg.offer.round,
      },
    });
  } else {
    await Message.findByIdAndUpdate(counterMsg._id, { $set: { 'offer.status': 'declined' } });
    replyMsg = await Message.create({
      chatId:   chat._id,
      senderId: req.user._id,
      type:     'offer_declined',
      text:     `❌ I can't accept ₹${counterMsg.offer.price.toLocaleString('en-IN')}. The item is still available at ₹${counterMsg.offer.basePrice.toLocaleString('en-IN')}.`,
      offer: {
        price:     counterMsg.offer.basePrice,
        basePrice: counterMsg.offer.basePrice,
        discount:  0,
        status:    'declined',
        round:     counterMsg.offer.round,
      },
    });
  }

  await Chat.findByIdAndUpdate(chat._id, {
    lastMessage:  replyMsg._id,
    lastActivity: new Date(),
  });

  const populated = await replyMsg.populate('senderId', 'name avatar');
  await broadcast(req, chat._id, populated, getRecipient(chat, req.user._id));

  sendResponse(res, 200, 'Response sent', { message: populated });
});

module.exports = {
  startChat,
  getMyChats,
  getChatMessages,
  sendOffer,
  respondToOffer,
  buyerRespondToCounter,
};