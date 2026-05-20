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
    price: {           // price per unit at time of purchase
        type: Number,
        required: true
    },
    total: {           // qty * price
        type: Number,
        required: true
    }
});

const orderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        unique: true,
        required: true
    },

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    items: [orderItemSchema],        // Embedded array as per your ERD

    shippingAddress: {
        fullName: { type: String, required: true, trim: true },
        phone: { type: String, required: true },
        addressLine: { type: String, required: true, trim: true},
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

    transactionId: String,           // razorpayPaymentId etc.

    couponCode: String,
    isCouponApplied: {
        type: Boolean,
        default: false
    },

    orderStatus: {
        type: String,
        enum: [
            'pending',
            'confirmed',
            'packed',
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

// Auto generate orderId before saving
orderSchema.pre("save", function (next) {
    if (!this.orderId) {
        const date = new Date();
        const prefix = `ORD${date.getFullYear().toString().slice(2)}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const random = Math.floor(10000 + Math.random() * 90000);
        this.orderId = `${prefix}${random}`;
    }
    next();
});

const Order = mongoose.model("Order", orderSchema);

export default Order;