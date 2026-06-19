import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({

    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },

    variantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false
    },

    productName: {
        type: String,
        required: true
    },

    variantName: String,

    productImage: String,

    qty: {
        type: Number,
        required: true,
        min: 1
    },

    price: {
        type: Number,
        required: true
    },

    total: {
        type: Number,
        required: true
    },

    itemStatus: {
        type: String,
        enum: [
            'active',
            'pending',
            'processing',
            'shipped',
            'out_for_delivery',
            'delivered',
            'cancelled',
            'returned'
        ],
        default: 'active'
    },

    cancelReason: String,

    returnReason: String,

    cancelledAt: Date,

    returnedAt: Date

});

const orderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        unique: true,
        required: true,
        default: function () {
            const date = new Date();
            const year = date.getFullYear().toString().slice(2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const random = Math.floor(100000 + Math.random() * 900000);
            return `ORD${year}${month}${random}`;
        }
    },

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    items: [orderItemSchema],

    shippingAddress: {
        fullName: { type: String, required: true, trim: true },
        phone: { type: String, required: true },
        addressLine: { type: String, required: true, trim: true },
        apartment: String,
        city: { type: String, required: true, trim: true },
        state: { type: String, required: true },
        pincode: { type: String, required: true },
        country: { type: String, default: "India" }
    },

    orderTotal: {
        type: Number,
        required: true
    },

    deliveryCharge: {
        type: Number,
        default: 0
    },

    discount: {
        type: Number,
        default: 0
    },

    finalAmount: {
        type: Number,
        required: true
    },

    paymentMethod: {
        type: String,
        enum: ['cod', 'razorpay', 'wallet'],
        required: true
    },

    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },

    transactionId: String,

    couponCode: String,
    isCouponApplied: {
        type: Boolean,
        default: false
    },

    orderStatus: {
        type: String,
        enum: [
            'pending',
            'processing',
            'shipped',
            'out_for_delivery',
            'delivered',
            'cancelled',
            'returned'
        ],
        default: 'pending'
    },

    returnReason: String,
    cancelReason: String,
    cancelledAt: Date,
    deliveredAt: Date,

}, { 
    timestamps: true 
});


const Order = mongoose.model("Order", orderSchema);

export default Order;