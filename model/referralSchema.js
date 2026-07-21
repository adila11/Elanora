import mongoose from "mongoose";

const referralSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    referralCode: {
      type: String,
      required: true,
    },

    rewardAmount: {
      type: Number,
      default: 100,
    },

    status: {
      type: String,
      enum: ["Pending", "Completed"],
      default: "Pending",
    },

    rewardedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Mongoose
export default mongoose.model("Referral", referralSchema);