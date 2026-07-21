import Coupon from "../../model/couponSchema.js";
import Cart from "../../model/cartSchema.js";
import { User } from "../../model/userSchema.js";
import { getEffectivePrice } from "../../utils/offerHelper.js";

// Apply Coupon
export const applyCoupon = async (req, res) => {
    try {
        const userEmail = req.session.user;
        if (!userEmail) {
            return res.status(401).json({ success: false, message: "Please login first" });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        const { couponCode } = req.body;
        if (!couponCode || !couponCode.trim()) {
            return res.json({ success: false, message: "Please enter a coupon code." });
        }

        const code = couponCode.trim().toUpperCase();

        const coupon = await Coupon.findOne({ couponCode: code });
        if (!coupon) {
            return res.json({ success: false, message: "Invalid coupon code." });
        }

        if (!coupon.isActive) {
            return res.json({ success: false, message: "This coupon is inactive." });
        }

        const now = new Date();
        if (now < new Date(coupon.startDate)) {
            return res.json({ success: false, message: "This coupon is not valid yet." });
        }
        if (now > new Date(coupon.expiryDate)) {
            return res.json({ success: false, message: "This coupon has expired." });
        }

        if (coupon.usageLimit !== null && coupon.usageLimit !== undefined) {
            if ((coupon.usageCount || 0) >= coupon.usageLimit) {
                return res.json({ success: false, message: "This coupon has reached its usage limit." });
            }
        }

        if (coupon.usedBy && coupon.usedBy.some(id => id.toString() === user._id.toString())) {
            return res.json({ success: false, message: "You have already used this coupon." });
        }

        const cart = await Cart.findOne({ userId: user._id }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });
        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: "Your cart is empty." });
        }

        let subtotal = 0;
        for (const item of cart.items) {
            const product = item.productId;
            if (!product) continue;
            const pricing = getEffectivePrice(product);
            const price = pricing.price;
            subtotal += price * item.qty;
        }

        const minPurchase = coupon.minimumPurchase || 0;
        if (subtotal < minPurchase) {
            return res.json({
                success: false,
                message: `Minimum purchase of ₹${minPurchase.toLocaleString('en-IN')} required.`
            });
        }

        let discount = 0;
        if (coupon.discountType === "percentage") {
            discount = Math.round(subtotal * coupon.discountValue / 100);
            if (coupon.maximumDiscount && coupon.maximumDiscount > 0) {
                discount = Math.min(discount, coupon.maximumDiscount);
            }
        } else {
            discount = coupon.discountValue;
        }

        discount = Math.min(discount, subtotal);

        return res.json({
            success: true,
            couponCode: code,
            discount,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            maximumDiscount: coupon.maximumDiscount || 0,
            description: coupon.description || "",
            message: `Coupon applied! You save ₹${discount.toLocaleString('en-IN')}.`
        });

    } catch (error) {
        console.error("APPLY COUPON ERROR:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};
