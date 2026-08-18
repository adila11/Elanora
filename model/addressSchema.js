import mongoose, { Schema } from "mongoose";

const addressSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    type: {
        type: String,
        enum: ["Home", "Office", "Other"],
        default: "Home"
    },

    fullName: {
        type: String,
        required: true,
        trim: true
    },

    phone: {
        type: String,
        required: true,
        match: /^[6-9]\d{9}$/
    },

    addressLine: {
        type: String,
        required: true,
        trim: true
    },

    city: {
        type: String,
        required: true,
        trim: true
    },

    district: {
        type: String,
        required: true,
        trim: true
    },

    state: {
        type: String,
        required: true,
    },

    pincode: {
        type: String,
        required: true,
        match: /^\d{6}$/
    },

    isDefault: {
        type: Boolean,
        default: false
    },
    isDelete: {
        type: Boolean,
        default: false
    }
})

const Address = mongoose.model("Address", addressSchema)

export default Address;