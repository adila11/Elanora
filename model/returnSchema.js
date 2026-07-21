import mongoose from "mongoose";

const returnSchema = new mongoose.Schema({

    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true
    },

    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    reason: {
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: [
            "pending",
            "approved",
            "rejected"
        ],
        default: "pending"
    },

    refundAmount: {
        type: Number,
        default: 0
    },

    adminRemark: {
        type: String
    },

    requestedAt: {
        type: Date,
        default: Date.now
    },

    processedAt: Date

}, {
    timestamps: true
});

const Return = mongoose.model("Return", returnSchema);

// Return
export default Return;