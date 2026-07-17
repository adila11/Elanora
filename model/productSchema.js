import mongoose from "mongoose";

const variantSchema = new mongoose.Schema({
    sku: {
        type: String,
        required: true,
    },
    color: {
        type: String,
        required: true
    },

    images: [
        {
            url: {
                type: String,
                required: true,
            }
        }
    ],

    stock: {
        type: Number,
        default: 0,
        min: 0
    },

    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true })

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },

    description: String,

    basePrice: {
        type: Number,
        required: true
    },

    discountPrice: {
        type: Number,
        required: true
    },

    merchantDiscountPrice: {
        type: Number
    },

    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category"
    },

    variants: [variantSchema],

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

    isListed: {
        type: Boolean,
        default: true
    }

}, { timestamps: true })
const Products = mongoose.model("Product", productSchema);
export  default Products ; 