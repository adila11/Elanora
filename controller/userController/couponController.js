import Coupon from "../../model/couponSchema.js";
import Cart from "../../model/cartSchema.js";
import { User } from "../../model/userSchema.js";


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

        // Find coupon in DB
        const coupon = await Coupon.findOne({ couponCode: code });
        if (!coupon) {
            return res.json({ success: false, message: "Invalid coupon code." });
        }

        // Check active flag
        if (!coupon.isActive) {
            return res.json({ success: false, message: "This coupon is inactive." });
        }

        // Check date window
        const now = new Date();
        if (now < new Date(coupon.startDate)) {
            return res.json({ success: false, message: "This coupon is not valid yet." });
        }
        if (now > new Date(coupon.expiryDate)) {
            return res.json({ success: false, message: "This coupon has expired." });
        }

        // Check usage limit
        if (coupon.usageLimit !== null && coupon.usageLimit !== undefined) {
            if (coupon.usageCount >= coupon.usageLimit) {
                return res.json({ success: false, message: "This coupon has reached its usage limit." });
            }
        }

        // Check if user already used this coupon
        if (coupon.usedBy && coupon.usedBy.some(id => id.toString() === user._id.toString())) {
            return res.json({ success: false, message: "You have already used this coupon." });
        }

        // Get cart subtotal
        const cart = await Cart.findOne({ userId: user._id }).populate("items.productId");
        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: "Your cart is empty." });
        }

        let subtotal = 0;
        for (const item of cart.items) {
            const product = item.productId;
            if (!product) continue;
            const price = product.discountPrice || product.basePrice;
            subtotal += price * item.qty;
        }

        // Check minimum purchase
        if (subtotal < coupon.minimumPurchase) {
            return res.json({
                success: false,
                message: `Minimum purchase of ₹${coupon.minimumPurchase.toLocaleString('en-IN')} required.`
            });
        }

        // Calculate discount
        let discount = 0;
        if (coupon.discountType === "percentage") {
            discount = Math.round(subtotal * coupon.discountValue / 100);
            // Apply maximumDiscount cap if set
            if (coupon.maximumDiscount && coupon.maximumDiscount > 0) {
                discount = Math.min(discount, coupon.maximumDiscount);
            }
        } else {
            // fixed
            discount = coupon.discountValue;
        }

        // Discount can't exceed subtotal
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
