import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },

    description: {
      type: String,
      trim: true
    },

    productIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
      }
    ],

    isActive: {
      type: Boolean,
      default: true
    },

    offer: {
        name: String,
        discountType: {
            type: String,
            enum: ["percentage", "flat"]
        },
        discountValue: Number,
        startDate: Date,
        endDate: Date
    },

    discountPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },

    discountExpiryDate: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

const Category = mongoose.model("Category", categorySchema);

export default Category;