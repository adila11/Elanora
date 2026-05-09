import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },

  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },

  qty: {
    type: Number,
    required: true,
    default: 1,
  },

  price: {
    type: Number,
    required: true
  },

  total: {
    type: Number,
    required: true
  }

}); 


const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true 
  },

  items: [cartItemSchema]

}, { timestamps: true });

export default mongoose.model("Cart", cartSchema);