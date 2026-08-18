import mongoose from "mongoose";
import generateReferralCode from "../utils/generateReferralCode.js";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    password: {
      type: String,
      required: false,
    },

    googleId: {
      type: String,
    },

    isGoogleUser: {
      type: Boolean,
      default: false,
    },

    phone: {
      type: String,
      trim: true,
    },
    profileIcon: {
      type: String,
      default: "default.png",
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function () {
  if (this.isNew && !this.referralCode) {
    let code = generateReferralCode(this.fullName);
    let isUnique = false;
    while (!isUnique) {
      const existing = await this.constructor.findOne({ referralCode: code });
      if (!existing) {
        isUnique = true;
      } else {
        code = generateReferralCode(this.fullName);
      }
    }
    this.referralCode = code;
  }
});

const userOtpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
  },
  otp: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userOtpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 300 });

const User = mongoose.model("User", userSchema);
const UserOtp = mongoose.model("UserOtp", userOtpSchema);

export { User, UserOtp };