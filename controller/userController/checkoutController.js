import Order from "../../model/orderSchema.js";
import Address from "../../model/addressSchema.js";
import Cart from "../../model/cartSchema.js";
import Product from "../../model/productSchema.js";
import { User } from "../../model/userSchema.js";
import Coupon from "../../model/couponSchema.js";
import razorpay from "../../config/razorpay.js";
import Wallet from "../../model/walletSchema.js";
import crypto from "crypto";
import { debitWallet } from "../../utils/walletHelper.js";
import { getEffectivePrice } from "../../utils/offerHelper.js";
import { allocateCouponDiscount } from "../../utils/couponAllocator.js";
import { MESSAGES } from '../../constants/messages.js';

const checkCartAvailability = (cart) => {
    if (!cart || cart.items.length === 0) return false;
    for (const item of cart.items) {
        const product = item.productId;
        if (!product || !product.isListed) return false;
        const variant = product.variants ? product.variants.id(item.variantId) : null;
        if (!variant || !variant.isActive || variant.stock < item.qty) return false;
    }
    return true;
};

export const loadCheckoutAddress = async (req, res) => {
    try {
        const userEmail = req.session.user;
        if (!userEmail) return res.redirect("/login");

        const user = await User.findOne({ email: userEmail });
        if (!user) return res.redirect("/login");

        const addresses = await Address.find({
            user: user._id,
            isDelete: false
        }).sort({ isDefault: -1, createdAt: -1 });

        const cart = await Cart.findOne({ userId: user._id })
            .populate({
                path: "items.productId",
                populate: {
                    path: "category"
                }
            });

        if (cart) {
            cart.items.forEach(item => {
                if (item.productId) {
                    const pricing = getEffectivePrice(item.productId);
                    item.price = pricing.price;
                    item.total = item.price * item.qty;
                }
            });
        }

        if (!checkCartAvailability(cart)) {
            return res.redirect("/cart?error=unavailable");
        }

        res.render("user/checkout/checkoutAddress", {
            addresses,
            cart,
            user
        });
    } catch (error) {
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};

export const loadCheckoutPayment = async (req, res) => {
    try {
        const userEmail = req.session.user;
        if (!userEmail) return res.redirect("/login");

        const user = await User.findOne({ email: userEmail });
        if (!user) return res.redirect("/login");

        const cart = await Cart.findOne({ userId: user._id })
            .populate({
                path: "items.productId",
                populate: {
                    path: "category"
                }
            });

        let subtotal = 0;

        for (const item of cart.items) {
            const product = item.productId;
            const pricing = getEffectivePrice(product);
            const price = pricing.price;
            item.price = price;
            item.total = price * item.qty;
            subtotal += price * item.qty;
        }

        const wallet = await Wallet.findOne({ userId: user._id });
        const walletBalance = wallet ? wallet.balance : 0;

        if (!checkCartAvailability(cart)) {
            return res.redirect("/cart?error=unavailable");
        }

        const addressId = req.body?.addressId || req.query?.addressId || req.session?.checkoutData?.addressId;
        if (!addressId) {
            return res.redirect("/checkout/address");
        }

        const now = new Date();
        const availableCoupons = await Coupon.find({
            isActive: true,
            startDate: { $lte: now },
            expiryDate: { $gt: now },
            $or: [
                { usageLimit: null },
                { $expr: { $lt: ["$usageCount", "$usageLimit"] } }
            ]
        }).select("couponCode description discountType discountValue minimumPurchase maximumDiscount").lean();

        let appliedCouponCode = "";
        let appliedDiscountAmount = 0;
        let appliedDiscountType = "";
        let appliedDiscountValue = 0;
        
        if (req.session.appliedCoupon) {
            const code = req.session.appliedCoupon;
            const coupon = await Coupon.findOne({ couponCode: code });
            
            if (coupon && coupon.isActive) {
                const withinDates = now >= new Date(coupon.startDate) && now <= new Date(coupon.expiryDate);
                const withinLimit = !coupon.usageLimit || (coupon.usageCount || 0) < coupon.usageLimit;
                const meetsMinimum = subtotal >= (coupon.minimumPurchase || 0);
                const notUsedBefore = !coupon.usedBy || !coupon.usedBy.some(id => id.toString() === user._id.toString());
                
                if (withinDates && withinLimit && meetsMinimum && notUsedBefore) {
                    appliedCouponCode = code;
                    appliedDiscountType = coupon.discountType;
                    appliedDiscountValue = coupon.discountValue;
                    
                    if (coupon.discountType === "percentage") {
                        appliedDiscountAmount = Math.round(subtotal * coupon.discountValue / 100);
                        if (coupon.maximumDiscount && coupon.maximumDiscount > 0) {
                            appliedDiscountAmount = Math.min(appliedDiscountAmount, coupon.maximumDiscount);
                        }
                    } else {
                        appliedDiscountAmount = coupon.discountValue;
                    }
                    appliedDiscountAmount = Math.min(appliedDiscountAmount, subtotal);
                } else {
                    req.session.appliedCoupon = null;
                }
            } else {
                req.session.appliedCoupon = null;
            }
        }

        res.render("user/checkout/checkoutPayment", { 
            cart, 
            user, 
            addressId, 
            availableCoupons, 
            walletBalance, 
            subtotal,
            couponCode: appliedCouponCode,
            discountAmount: appliedDiscountAmount,
            discountType: appliedDiscountType,
            discountValue: appliedDiscountValue
        });
    } catch (error) {
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};


export const loadCheckoutReview = async (req, res) => {
    try {
        const userEmail = req.session.user;
        if (!userEmail) return res.redirect("/login");

        const user = await User.findOne({ email: userEmail });
        if (!user) return res.redirect("/login");

        const cart = await Cart.findOne({ userId: user._id })
            .populate({
                path: "items.productId",
                populate: {
                    path: "category"
                }
            });

        let subtotal = 0;
        if (cart) {
            cart.items.forEach(item => {
                if (item.productId) {
                    const pricing = getEffectivePrice(item.productId);
                    item.price = pricing.price;
                    item.total = item.price * item.qty;
                    subtotal += item.total;
                }
            });
        }

        if (!checkCartAvailability(cart)) {
            return res.redirect("/cart?error=unavailable");
        }

        const { addressId, paymentMethod = "cod" } = req.body;

        const address = await Address.findOne({
            _id: addressId,
            user: user._id
        });

        if (!cart || !address) {
            return res.redirect("/checkout/address");
        }

        let finalCouponCode = "";
        let finalDiscountAmount = 0;

        if (req.session.appliedCoupon) {
            const code = req.session.appliedCoupon;
            const coupon = await Coupon.findOne({ couponCode: code });
            
            if (coupon && coupon.isActive) {
                const now = new Date();
                const withinDates = now >= new Date(coupon.startDate) && now <= new Date(coupon.expiryDate);
                const withinLimit = !coupon.usageLimit || (coupon.usageCount || 0) < coupon.usageLimit;
                const meetsMinimum = subtotal >= (coupon.minimumPurchase || 0);
                const notUsedBefore = !coupon.usedBy || !coupon.usedBy.some(id => id.toString() === user._id.toString());
                
                if (withinDates && withinLimit && meetsMinimum && notUsedBefore) {
                    finalCouponCode = code;
                    if (coupon.discountType === "percentage") {
                        finalDiscountAmount = Math.round(subtotal * coupon.discountValue / 100);
                        if (coupon.maximumDiscount && coupon.maximumDiscount > 0) {
                            finalDiscountAmount = Math.min(finalDiscountAmount, coupon.maximumDiscount);
                        }
                    } else {
                        finalDiscountAmount = coupon.discountValue;
                    }
                    finalDiscountAmount = Math.min(finalDiscountAmount, subtotal);
                } else {
                    req.session.appliedCoupon = null;
                }
            } else {
                req.session.appliedCoupon = null;
            }
        }

        req.session.checkoutData = {
            addressId,
            paymentMethod,
            couponCode: finalCouponCode,
            discountAmount: finalDiscountAmount
        };

        res.render("user/checkout/checkoutReview", {
            cart,
            address,
            user,
            paymentMethod,
            couponCode: finalCouponCode,
            discountAmount: finalDiscountAmount
        });
    } catch (error) {
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};

const generateOrderId = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(100000 + Math.random() * 900000); // 6 digits
    return `ORD${year}${month}${random}`;
};



export const createRazorpayOrder = async (req, res) => {
    try {
        const userEmail = req.session.user;

        if (!userEmail) {
            return res.status(401).json({ success: false, message: MESSAGES.AUTH_PLEASE_LOGIN });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(401).json({ success: false, message: MESSAGES.USER_NOT_FOUND });
        }

        const userId = user._id;
        const { addressId } = req.body;
        const couponCode = req.session.appliedCoupon || req.body.couponCode || "";

        const address = await Address.findOne({ _id: addressId, user: userId });
        if (!address) {
            return res.status(400).json({ success: false, message: MESSAGES.USER_ADDRESS_NOT_FOUND });
        }

        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: MESSAGES.CART_EMPTY });
        }

        let subtotal = 0;
        const orderItems = [];

        for (const item of cart.items) {
            const product = item.productId;

            if (!product) {
                return res.status(400).json({ success: false, message: MESSAGES.PRODUCT_NOT_FOUND_1 });
            }

            if (!product.isListed) {
                return res.status(400).json({ success: false, message: MESSAGES.DYNAMIC_IS_UNAVAILABLE(product) });
            }

            const variant = product.variants.id(item.variantId);

            if (!variant || !variant.isActive) {
                return res.status(400).json({ success: false, message: MESSAGES.DYNAMIC_VARIANT_UNAVAILABLE(product) });
            }

            if (variant.stock < item.qty) {
                return res.status(400).json({ success: false, message: MESSAGES.DYNAMIC_IS_OUT_OF_STOCK(product) });
            }

            const pricing = getEffectivePrice(product);
            const price = pricing.price;
            const total = price * item.qty;
            const productImage = variant && variant.images && variant.images.length > 0
                ? variant.images[0].url : "";
            const variantName = variant ? variant.color : "";

            orderItems.push({
                productId: product._id,
                variantId: item.variantId,
                productName: product.name,
                variantName: variantName,
                productImage: productImage,
                qty: item.qty,
                price: price,
                total: total
            });

            subtotal += total;
        }

        let appliedCoupon = null;
        let discount = 0;

        if (couponCode) {
            const coupon = await Coupon.findOne({ couponCode: couponCode.trim().toUpperCase() });
            if (coupon && coupon.isActive) {
                const now = new Date();
                const withinDates = now >= new Date(coupon.startDate) && now <= new Date(coupon.expiryDate);
                const withinLimit = !coupon.usageLimit || coupon.usageCount < coupon.usageLimit;
                const meetsMinimum = subtotal >= coupon.minimumPurchase;
                const notUsedBefore = !coupon.usedBy || !coupon.usedBy.some(id => id.toString() === userId.toString());

                if (withinDates && withinLimit && meetsMinimum && notUsedBefore) {
                    if (coupon.discountType === "percentage") {
                        discount = Math.round(subtotal * coupon.discountValue / 100);
                        if (coupon.maximumDiscount && coupon.maximumDiscount > 0) {
                            discount = Math.min(discount, coupon.maximumDiscount);
                        }
                    } else {
                        discount = coupon.discountValue;
                    }
                    discount = Math.min(discount, subtotal);
                    appliedCoupon = coupon;
                }
            }
        }

        if (appliedCoupon && discount > 0) {
            allocateCouponDiscount(orderItems, appliedCoupon, discount);
        } else {
            orderItems.forEach(i => {
                i.couponDiscount = 0;
                i.couponDiscountLine = 0;
            });
        }

        const deliveryCharge = 0;
        const finalAmount = subtotal + deliveryCharge - discount;
        const amount = finalAmount * 100;

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: `receipt_${Date.now()}`
        });

        // Save DB order with paymentStatus 'pending' BEFORE payment
        const order = new Order({
            orderId: generateOrderId(),
            userId,
            items: orderItems,
            shippingAddress: {
                fullName: address.fullName,
                phone: address.phone,
                addressLine: address.addressLine,
                apartment: address.apartment || "",
                city: address.city,
                district: address.district,
                state: address.state,
                pincode: address.pincode,
                country: "India"
            },
            orderTotal: subtotal,
            deliveryCharge,
            discount,
            finalAmount,
            paymentMethod: "razorpay",
            couponCode: appliedCoupon ? appliedCoupon.couponCode : undefined,
            isCouponApplied: !!appliedCoupon,
            orderStatus: "pending",
            paymentStatus: "pending",
            razorpayOrderId: razorpayOrder.id
        });

        await order.save();

        // Deduct stock
        for (let item of cart.items) {
            await Product.findOneAndUpdate(
                { "_id": item.productId, "variants._id": item.variantId },
                { $inc: { "variants.$.stock": -item.qty } }
            );
        }

        // Apply coupon usage
        if (appliedCoupon) {
            await Coupon.findByIdAndUpdate(appliedCoupon._id, {
                $inc: { usageCount: 1 },
                $addToSet: { usedBy: userId }
            });
        }

        // Clear cart and session
        await Cart.findOneAndDelete({ userId });
        req.session.appliedCoupon = null;
        req.session.checkoutData = null;

        return res.json({
            success: true,
            orderId: razorpayOrder.id,
            internalOrderId: order._id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to create Razorpay order"
        });
    }
};





export const placeOrder = async (req, res) => {
    try {
        const userEmail = req.session.user;
        if (!userEmail) {
            return res.status(401).json({ success: false, message: MESSAGES.AUTH_PLEASE_LOGIN });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(401).json({ success: false, message: MESSAGES.USER_NOT_FOUND });
        }

        const userId = user._id;

        const { addressId, paymentMethod = "cod", discountAmount = 0 } = req.body;
        const couponCode = req.session.appliedCoupon || req.body.couponCode || "";

        const address = await Address.findOne({ _id: addressId, user: userId });
        if (!address) {
            return res.status(400).json({ success: false, message: MESSAGES.USER_ADDRESS_NOT_FOUND });
        }

        const cart = await Cart.findOne({ userId: userId }).populate({
            path: "items.productId",
            populate: {
                path: "category"
            }
        });
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: MESSAGES.CART_EMPTY });
        }

        let subtotal = 0;
        const orderItems = [];

        for (let item of cart.items) {

            const product = item.productId;


            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: MESSAGES.PRODUCT_NOT_FOUND_1
                });
            }



            if (!product.isListed) {

                return res.status(400).json({
                    success: false,
                    message: `${product.name} is currently unavailable`
                });

            }


            const variant = product.variants.id(item.variantId);


            if (!variant || !variant.isActive) {

                return res.status(400).json({
                    success: false,
                    message: `${product.name} variant is unavailable`
                });

            }



            if (variant.stock < item.qty) {

                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.name}`
                });

            }

            const pricing = getEffectivePrice(product);
            const price = pricing.price;
            const total = price * item.qty;
            const productImage = variant && variant.images && variant.images.length > 0
                ? variant.images[0].url : "";
            const variantName = variant ? variant.color : "";

            orderItems.push({
                productId: product._id,
                variantId: item.variantId,
                productName: product.name,
                variantName: variantName,
                productImage: productImage,
                qty: item.qty,
                price: price,
                total: total
            });

            subtotal += total;
        }

        const deliveryCharge = 0;

        let appliedCoupon = null;
        let discount = 0;

        if (couponCode) {
            const coupon = await Coupon.findOne({ couponCode: couponCode.trim().toUpperCase() });
            if (coupon && coupon.isActive) {
                const now = new Date();
                const withinDates = now >= new Date(coupon.startDate) && now <= new Date(coupon.expiryDate);
                const withinLimit = !coupon.usageLimit || coupon.usageCount < coupon.usageLimit;
                const meetsMinimum = subtotal >= coupon.minimumPurchase;
                const notUsedBefore = !coupon.usedBy || !coupon.usedBy.some(id => id.toString() === userId.toString());

                if (withinDates && withinLimit && meetsMinimum && notUsedBefore) {
                    if (coupon.discountType === "percentage") {
                        discount = Math.round(subtotal * coupon.discountValue / 100);
                        if (coupon.maximumDiscount && coupon.maximumDiscount > 0) {
                            discount = Math.min(discount, coupon.maximumDiscount);
                        }
                    } else {
                        discount = coupon.discountValue;
                    }
                    discount = Math.min(discount, subtotal);
                    appliedCoupon = coupon;
                }
            }
        }

        if (appliedCoupon && discount > 0) {
            allocateCouponDiscount(orderItems, appliedCoupon, discount);
        } else {
            orderItems.forEach(i => {
                i.couponDiscount = 0;
                i.couponDiscountLine = 0;
            });
        }

        const finalAmount = subtotal + deliveryCharge - discount;

        if (paymentMethod === "cod" && finalAmount > 1000) {
            throw new Error("Cash on Delivery is available only for orders up to ₹1000.");
        }

        if (paymentMethod === "wallet") {

            const wallet = await Wallet.findOne({
                userId
            });

            if (!wallet) {
                return res.status(400).json({
                    success: false,
                    message: "Wallet not found"
                });
            }

            if (wallet.balance < finalAmount) {
                return res.status(400).json({
                    success: false,
                    message: MESSAGES.USER_INSUFFICIENT_WALLET_BALANCE
                });
            }

        }



        const order = new Order({
            orderId: generateOrderId(),
            userId,
            items: orderItems,
            shippingAddress: {
                fullName: address.fullName,
                phone: address.phone,
                addressLine: address.addressLine,
                apartment: address.apartment || "",
                city: address.city,
                district: address.district,
                state: address.state,
                pincode: address.pincode,
                country: "India"
            },
            orderTotal: subtotal,
            deliveryCharge,
            discount,
            finalAmount,
            paymentMethod,
            couponCode: appliedCoupon ? appliedCoupon.couponCode : undefined,
            isCouponApplied: !!appliedCoupon,
            orderStatus: "pending",
            paymentStatus: paymentMethod === "cod" ? "pending" : "paid"
        });

        await order.save();

        if (paymentMethod === "wallet") {

            await debitWallet({
                userId,
                amount: finalAmount,
                source: "order_payment",
                orderId: order._id,
                description: `Wallet payment for Order ${order.orderId}`
            });

        }

        if (appliedCoupon) {
            await Coupon.findByIdAndUpdate(appliedCoupon._id, {
                $inc: { usageCount: 1 },
                $addToSet: { usedBy: userId }
            });
        }

        for (let item of cart.items) {
            await Product.findOneAndUpdate(
                { "_id": item.productId, "variants._id": item.variantId },
                { $inc: { "variants.$.stock": -item.qty } }
            );
        }

        await Cart.findOneAndDelete({ userId: userId });

        req.session.appliedCoupon = null;
        req.session.checkoutData = null;

        res.json({
            success: true,
            message: "Order placed successfully!",
            orderId: order.orderId || order._id,
            redirectUrl: `/order-success/${order._id}`
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to place order" });
    }

};


export const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, internalOrderId } = req.body;

        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: MESSAGES.ORDER_INVALID_PAYMENT_SIGNATURE
            });
        }

        // Find existing order by razorpayOrderId (created in createRazorpayOrder)
        const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
        if (!order) {
            return res.status(404).json({ success: false, message: MESSAGES.ORDER_NOT_FOUND });
        }

        // Update payment status to paid
        order.paymentStatus = "paid";
        order.orderStatus = "pending";
        order.razorpayPaymentId = razorpay_payment_id;
        order.razorpaySignature = razorpay_signature;
        order.paymentFailedAt = undefined;
        order.orderExpiresAt = undefined;
        await order.save();

        return res.json({
            success: true,
            message: "Payment verified successfully",
            orderId: order._id,
            redirectUrl: `/order-success/${order._id}`
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: MESSAGES.ORDER_PAYMENT_VERIFICATION_FAILED
        });
    }
};


export const handlePaymentFailure = async (req, res) => {
    try {
        const { internalOrderId } = req.body;

        if (!internalOrderId) {
            return res.status(400).json({ success: false, message: "Order ID required" });
        }

        const order = await Order.findById(internalOrderId);
        if (!order) {
            return res.status(404).json({ success: false, message: MESSAGES.ORDER_NOT_FOUND });
        }

        // Only mark as failed if still pending
        if (order.paymentStatus === "pending") {
            order.paymentStatus = "failed";
            order.orderStatus = "payment_failed";
            order.paymentFailedAt = new Date();
            // Allow retry for 24 hours
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);
            order.orderExpiresAt = expiresAt;
            await order.save();
        }

        return res.json({ success: true, message: "Payment failure recorded" });

    } catch (error) {
        return res.status(500).json({ success: false, message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
    }
};


export const loadOrderSuccess = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).render("user/profile/pageNotFound");

        const from = new Date(order.createdAt);
        const to = new Date(order.createdAt);
        from.setDate(from.getDate() + 3);
        to.setDate(to.getDate() + 5);
        const fmt = d => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

        res.render("user/checkout/orderSuccess", {
            order: {
                _id: order._id,
                orderId: order.orderId || order._id,
                totalAmount: order.finalAmount,
                deliveryRange: `${fmt(from)} – ${fmt(to)}`
            }
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(404).render("user/profile/pageNotFound");
        }
        res.redirect("/");
    }
};

export const loadOrderFailed = async (req, res) => {
    try {
        const rawReason = req.query.reason || "Payment Failed";
        const reason = rawReason.length > 150 ? "Payment Failed" : rawReason;
        const orderId = req.query.orderId || "";

        return res.render("user/checkout/orderFailed", {
            title: "Payment Failed",
            reason,
            orderId
        });

    } catch (error) {
        return res.redirect("/cart");
    }
};