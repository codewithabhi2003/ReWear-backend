const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  // Frozen snapshot at order time — survives product deletion/edits
  productSnapshot: {
    title:        String,
    brand:        String,
    size:         String,
    condition:    String,
    image:        String,
    sellingPrice: Number,
  },
  shippingAddress: {
    name:    String,
    phone:   String,
    street:  String,
    city:    String,
    state:   String,
    pincode: String,
  },
  payment: {
    razorpayOrderId:   { type: String, default: '' },
    razorpayPaymentId: { type: String, default: '' },
    razorpaySignature: { type: String, default: '' },
    method:  { type: String, default: 'razorpay' },
    status:  {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    paidAt: Date,
    amount: Number,
  },
  status: {
    type: String,
    enum: ['Payment Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'],
    default: 'Payment Pending',
  },
  statusHistory: [
    {
      status:    String,
      updatedAt: { type: Date, default: Date.now },
      note:      String,
    },
  ],
  isReviewed: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

orderSchema.index({ buyerId: 1, createdAt: -1 });
orderSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
