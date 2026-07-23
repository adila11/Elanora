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

// Load Checkout Address
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
        console.error(error);
        res.status(500).send("Server Error");
    }
};

// Load Checkout Payment
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

        res.render("user/checkout/checkoutPayment", { cart, user, addressId, availableCoupons, walletBalance, subtotal });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};


// Load Checkout Review
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

        const { addressId, paymentMethod = "cod", couponCode = "", discountAmount = 0 } = req.body;

        const address = await Address.findOne({
            _id: addressId,
            user: user._id
        });

        if (!cart || !address) {
            return res.redirect("/checkout/address");
        }

        // Store checkout data in session for retry flow
        req.session.checkoutData = {
            addressId,
            paymentMethod,
            couponCode: couponCode || "",
            discountAmount: Number(discountAmount) || 0
        };

        res.render("user/checkout/checkoutReview", {
            cart,
            address,
            user,
            paymentMethod,
            couponCode: couponCode || "",
            discountAmount: Number(discountAmount) || 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};

const generateOrderId = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(100000 + Math.random() * 900000); // 6 digits
    return `ORD${year}${month}${random}`;
};



// Create Razorpay Order
export const createRazorpayOrder = async (req, res) => {
    try {

        const userEmail = req.session.user;

        if (!userEmail) {
            return res.status(401).json({
                success: false,
                message: "Please login"
            });
        }

        const user = await User.findOne({ email: userEmail });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found"
            });
        }

        const userId = user._id;

        const {
            addressId,
            couponCode = ""
        } = req.body;



        const address = await Address.findOne({
            _id: addressId,
            user: userId
        });

        if (!address) {
            return res.status(400).json({
                success: false,
                message: "Address not found"
            });
        }


        const cart = await Cart.findOne({
            userId
        }).populate({
            path: "items.productId",
            populate: {
                path: "category"
            }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Cart is empty"
            });
        }


        let subtotal = 0;

        for (const item of cart.items) {

            const product = item.productId;

            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: "Product not found"
                });
            }

            if (!product.isListed) {
                return res.status(400).json({
                    success: false,
                    message: `${product.name} is unavailable`
                });
            }

            const variant = product.variants.id(item.variantId);

            if (!variant || !variant.isActive) {
                return res.status(400).json({
                    success: false,
                    message: `${product.name} variant unavailable`
                });
            }

            if (variant.stock < item.qty) {
                return res.status(400).json({
                    success: false,
                    message: `${product.name} is out of stock`
                });
            }

            const pricing = getEffectivePrice(product);
            const price = pricing.price;

            subtotal += price * item.qty;
        }


        let discount = 0;

        if (couponCode) {

            const coupon = await Coupon.findOne({
                couponCode: couponCode.trim().toUpperCase()
            });

            if (coupon && coupon.isActive) {

                const now = new Date();

                const withinDates =
                    now >= coupon.startDate &&
                    now <= coupon.expiryDate;

                const withinLimit =
                    !coupon.usageLimit ||
                    coupon.usageCount < coupon.usageLimit;

                const meetsMinimum =
                    subtotal >= coupon.minimumPurchase;

                const notUsedBefore =
                    !coupon.usedBy ||
                    !coupon.usedBy.some(
                        id => id.toString() === userId.toString()
                    );

                if (
                    withinDates &&
                    withinLimit &&
                    meetsMinimum &&
                    notUsedBefore
                ) {

                    if (coupon.discountType === "percentage") {

                        discount =
                            Math.round(
                                subtotal *
                                coupon.discountValue /
                                100
                            );

                        if (
                            coupon.maximumDiscount &&
                            discount > coupon.maximumDiscount
                        ) {
                            discount = coupon.maximumDiscount;
                        }

                    } else {

                        discount = coupon.discountValue;

                    }

                    discount = Math.min(discount, subtotal);

                }

            }

        }



        const deliveryCharge = 0;

        const finalAmount =
            subtotal +
            deliveryCharge -
            discount;


        const amount = finalAmount * 100;



        const razorpayOrder =
            await razorpay.orders.create({

                amount,

                currency: "INR",

                receipt: `receipt_${Date.now()}`

            });


        return res.json({

            success: true,

            orderId: razorpayOrder.id,

            amount: razorpayOrder.amount,

            currency: razorpayOrder.currency,

            key: process.env.RAZORPAY_KEY_ID

        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Failed to create Razorpay order"

        });

    }
};





// Place Order
export const placeOrder = async (req, res) => {
    try {
        const userEmail = req.session.user;
        if (!userEmail) {
            return res.status(401).json({ success: false, message: "Please login" });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        const userId = user._id;

        const { addressId, paymentMethod = "cod", couponCode = "", discountAmount = 0 } = req.body;

        const address = await Address.findOne({ _id: addressId, user: userId });
        if (!address) {
            return res.status(400).json({ success: false, message: "Address not found" });
        }

        const cart = await Cart.findOne({ userId: userId }).populate({
            path: "items.productId",
            populate: {
                path: "category"
            }
        });
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty" });
        }

        let subtotal = 0;
        const orderItems = [];

        for (let item of cart.items) {

            const product = item.productId;


            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: "Product not found"
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
                    message: "Insufficient wallet balance"
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

        res.json({
            success: true,
            message: "Order placed successfully!",
            orderId: order.orderId || order._id,
            redirectUrl: `/order-success/${order._id}`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to place order" });
    }

};


// Verify Payment
export const verifyPayment = async (req, res) => {

    try {

        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addressId, paymentMethod, couponCode } = req.body;

        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment signature"
            });
        }


        const userEmail = req.session.user;
        if (!userEmail) {
            return res.status(401).json({ success: false, message: "Please login" });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        const userId = user._id;


        const address = await Address.findOne({ _id: addressId, user: userId });
        if (!address) {
            return res.status(400).json({ success: false, message: "Address not found" });
        }

        const cart = await Cart.findOne({ userId: userId }).populate({
            path: "items.productId",
            populate: {
                path: "category"
            }
        });
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty" });
        }

        let subtotal = 0;
        const orderItems = [];

        for (let item of cart.items) {

            const product = item.productId;


            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: "Product not found"
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
            paymentStatus: "paid"
        });

        await order.save();

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

        return res.json({
            success: true,
            message: "Payment verified successfully",
            orderId: order.orderId || order._id,
            redirectUrl: `/order-success/${order._id}`
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Payment verification failed"
        });

    }

};

// Load Order Success
export const loadOrderSuccess = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.redirect("/");

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
        console.error(error);
        res.redirect("/");
    }
};

// Load Order Failed
export const loadOrderFailed = async (req, res) => {

    try {

        const rawReason = req.query.reason || "Payment Failed";
        const reason = rawReason.length > 150 ? "Payment Failed" : rawReason;

        // Retrieve checkout data from session for retry
        const checkoutData = req.session.checkoutData || {};

        return res.render("user/checkout/orderFailed", {
            title: "Payment Failed",
            reason,
            addressId: checkoutData.addressId || "",
            paymentMethod: checkoutData.paymentMethod || "razorpay",
            couponCode: checkoutData.couponCode || "",
            discountAmount: checkoutData.discountAmount || 0
        });

    } catch (error) {
        console.log(error);
        return res.redirect("/cart");

    }

};