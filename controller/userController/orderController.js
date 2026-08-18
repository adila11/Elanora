import Order from "../../model/orderSchema.js";
import Address from "../../model/addressSchema.js";
import Cart from "../../model/cartSchema.js";
import Product from "../../model/productSchema.js";
import Return from "../../model/returnSchema.js";
import { User } from "../../model/userSchema.js";
import { creditWallet } from "../../utils/walletHelper.js";
import { revalidateCouponAgainstCart, cancelOrderDueToCouponBreach } from "../../utils/couponValidator.js";
import razorpay from "../../config/razorpay.js";
import crypto from "crypto";
import { MESSAGES } from '../../constants/messages.js';


export const getOrders = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const user = await User.findOne({ email: req.session.user });
        if (!user) return res.redirect('/login');

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, parseInt(req.query.limit) || 5);
        const skip = (page - 1) * limit;

        const totalCount = await Order.countDocuments({ userId: user._id });

        const orders = await Order.find({ userId: user._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('items.productId', 'name variants');

        const totalPages = Math.ceil(totalCount / limit);

        res.render('user/order/orderList', {
            user,
            orders,
            title: 'My Orders',
            pagination: {
                currentPage: page,
                totalPages,
                totalCount,
                limit,
                hasPrev: page > 1,
                hasNext: page < totalPages,
                prevPage: page - 1,
                nextPage: page + 1,
            },
        });
    } catch (err) {
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};


export const getOrderDetail = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const user = await User.findOne({ email: req.session.user });
        if (!user) return res.redirect("/login");

        const order = await Order.findOne({ _id: req.params.id, userId: user._id });
        if (!order) return res.status(404).render("user/profile/pageNotFound");

        if (order.orderStatus === 'delivered') {
            let modified = false;
            if (order.paymentStatus !== 'paid') {
                order.paymentStatus = 'paid';
                modified = true;
            }
            order.items.forEach(item => {
                if (item.itemStatus !== 'cancelled' && item.itemStatus !== 'returned' && item.itemStatus !== 'delivered') {
                    item.itemStatus = 'delivered';
                    modified = true;
                }
            });
            if (modified) await order.save();
        }

        const returnRequests = await Return.find({ orderId: order._id });

        const orderObj = order.toObject();
        orderObj.items.forEach(item => {
            const rr = returnRequests.find(r => r.itemId.toString() === item._id.toString());
            item.returnRequest = rr || null;
        });

        res.render("user/order/orderDetail", { order: orderObj, user });

    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(404).render("user/profile/pageNotFound");
        }
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};


export const cancelFullOrder = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { reason } = req.body;

        const user = await User.findOne({ email: req.session.user });
        if (!user) return res.status(401).json({ success: false, message: MESSAGES.USER_NOT_FOUND });

        const order = await Order.findOne({ _id: orderId, userId: user._id });
        if (!order) return res.status(404).json({ success: false, message: MESSAGES.ORDER_NOT_FOUND });

        const blockedStatuses = ["shipped", "out_for_delivery", "delivered"];
        if (blockedStatuses.includes(order.orderStatus)) {
            return res.status(400).json({ success: false, message: "Order cannot be cancelled after shipping" });
        }

        if (order.orderStatus === "cancelled") {
            return res.status(400).json({ success: false, message: "Order already cancelled" });
        }

        let sanitizedReason = (reason || "").trim();
        if (sanitizedReason.length > 100) {
            sanitizedReason = sanitizedReason.substring(0, 100);
        }

        order.orderStatus = "cancelled";
        order.cancelReason = sanitizedReason;
        order.cancelledAt = new Date();

        for (let item of order.items) {
            if (item.itemStatus !== "cancelled" && item.itemStatus !== "returned") {
                item.itemStatus = "cancelled";
                item.cancelReason = sanitizedReason;
                item.cancelledAt = new Date();

                await Product.findOneAndUpdate(
                    { "_id": item.productId, "variants._id": item.variantId },
                    { $inc: { "variants.$.stock": item.qty } }
                );
            }
        }

        if (order.orderStatus === 'delivered') {
            let modified = false;
            if (order.paymentStatus !== 'paid') {
                order.paymentStatus = 'paid';
                modified = true;
            }
            order.items.forEach(item => {
                if (item.itemStatus !== 'cancelled' && item.itemStatus !== 'returned' && item.itemStatus !== 'delivered') {
                    item.itemStatus = 'delivered';
                    modified = true;
                }
            });
            if (modified) await order.save();
        }

        await order.save();

        if (order.paymentStatus === "paid") {

            order.paymentStatus = "refunded";
            await order.save();

            await creditWallet({
                userId: user._id,
                amount: order.finalAmount,
                source: "order_cancel",
                orderId: order._id,
                description: `Refund for cancelled order ${order.orderId}`
            });
        }

        return res.status(200).json({ success: true, message: "Order cancelled successfully" });

    } catch (error) {
        return res.status(500).json({ success: false, message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
    }
};


export const cancelSingleItem = async (req, res) => {
    try {
        const { orderId, itemId, reason } = req.body;

        const user = await User.findOne({ email: req.session.user });
        if (!user) return res.status(401).json({ success: false });

        const order = await Order.findOne({ _id: orderId, userId: user._id });
        if (!order) return res.status(404).json({ success: false });

        const item = order.items.id(itemId);

        if (!item) {
            return res.status(404).json({
                success: false,
                message: MESSAGES.OTHER_ITEM_NOT_FOUND
            });
        }


        const blockedStatuses = [
            'shipped',
            'out_for_delivery',
            'delivered'
        ];

        if (blockedStatuses.includes(order.orderStatus) || blockedStatuses.includes(item.itemStatus)) {
            return res.status(400).json({
                success: false,
                message: "Cannot cancel this item after shipping"
            });
        }



        if (order.isCouponApplied && order.couponCode && item.itemStatus !== "cancelled" && item.itemStatus !== "returned") {
            const couponCheck = await revalidateCouponAgainstCart(order, [item._id]);
            if (!couponCheck.isEligible) {
                const { confirmFullCancel } = req.body;
                if (!confirmFullCancel) {
                    return res.json({
                        success: false,
                        requiresConfirmation: true,
                        isCouponBreach: true,
                        couponCode: couponCheck.couponCode,
                        minCartValue: couponCheck.minCartValue,
                        remainingSubtotal: couponCheck.remainingSubtotal,
                        message: `Cancelling this item will reduce your subtotal to ₹${couponCheck.remainingSubtotal.toLocaleString('en-IN')}, which is below the ₹${couponCheck.minCartValue.toLocaleString('en-IN')} minimum purchase required for coupon "${couponCheck.couponCode}". Proceeding will cancel your ENTIRE order with a full refund to your wallet.`
                    });
                }

                const breachResult = await cancelOrderDueToCouponBreach(
                    order,
                    couponCheck,
                    `Item cancellation caused coupon minimum purchase breach (${couponCheck.couponCode})`,
                    "user"
                );
                return res.json({
                    success: true,
                    message: "Full order cancelled and refunded to your wallet due to coupon minimum purchase requirement breach.",
                    autoCancelledOrder: true,
                });
            }
        }

        let sanitizedReason = (reason || "").trim();
        if (sanitizedReason.length > 100) {
            sanitizedReason = sanitizedReason.substring(0, 100);
        }

        if (item.itemStatus !== "cancelled" && item.itemStatus !== "returned") {
            item.itemStatus = "cancelled";
            item.cancelReason = sanitizedReason;
            item.cancelledAt = new Date();

            await Product.findOneAndUpdate(
                { "_id": item.productId, "variants._id": item.variantId },
                { $inc: { "variants.$.stock": item.qty } }
            );
        }

        const allCancelled = order.items.every(
            i => i.itemStatus === "cancelled"
        );

        if (allCancelled) {
            order.orderStatus = "cancelled";
            order.cancelledAt = new Date();

            const originalSubtotal = order.items.reduce(
                (sum, i) => sum + i.total,
                0
            );

            order.orderTotal = originalSubtotal;
            order.finalAmount =
                originalSubtotal +
                (order.deliveryCharge || 0) -
                (order.discount || 0);
        }

        await order.save();

        if (order.paymentStatus === "paid") {
            const netRefund = Math.max(0, item.total - (item.couponDiscountLine || 0));
            await creditWallet({
                userId: user._id,
                amount: netRefund,
                source: "order_cancel",
                orderId: order._id,
                description: `Refund for cancelled item in order ${order.orderId}`
            });

            if (order.items.every(i => i.itemStatus === "cancelled")) {
                order.paymentStatus = "refunded";
                await order.save();
            }
        }

        res.json({ success: true, message: "Item cancelled successfully" });

    } catch (error) {
        res.status(500).json({ success: false });
    }
};


export const returnItem = async (req, res) => {
    try {

        const { orderId, itemId, reason } = req.body;

        const user = await User.findOne({
            email: req.session.user
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: MESSAGES.USER_NOT_FOUND
            });
        }

        const order = await Order.findOne({
            _id: orderId,
            userId: user._id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: MESSAGES.ORDER_NOT_FOUND
            });
        }

        if (order.orderStatus !== "delivered") {
            return res.status(400).json({
                success: false,
                message: "Return is allowed only after delivery"
            });
        }

        const item = order.items.id(itemId);

        if (!item) {
            return res.status(404).json({
                success: false,
                message: MESSAGES.OTHER_ITEM_NOT_FOUND
            });
        }

        const ineligibleStatuses = ["cancelled", "returned", "return_requested", "return_rejected"];
        if (ineligibleStatuses.includes(item.itemStatus)) {
            return res.status(400).json({
                success: false,
                message: "This item cannot be returned"
            });
        }

        const existingReturn = await Return.findOne({
            orderId,
            itemId
        });

        if (existingReturn) {
            return res.status(400).json({
                success: false,
                message: "Return request already submitted"
            });
        }

        const netRefund = Math.max(0, item.total - (item.couponDiscountLine || 0));

        await Return.create({
            orderId,
            itemId,
            userId: user._id,
            reason,
            refundAmount: netRefund
        });

        item.itemStatus = "return_requested";
        item.returnReason = reason;
        item.returnRequestedAt = new Date();

        await order.save();

        return res.json({
            success: true,
            message: "Return request submitted successfully"
        });

    } catch (error) {


        return res.status(500).json({
            success: false,
            message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR
        });

    }
};



export const validateRetryPayment = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.session.user });
        if (!user) return res.status(401).json({ success: false, message: MESSAGES.USER_NOT_FOUND });

        const order = await Order.findOne({ _id: req.params.id, userId: user._id });
        if (!order) return res.status(404).json({ success: false, message: MESSAGES.ORDER_NOT_FOUND });

        if (order.paymentStatus !== 'failed') {
            return res.status(400).json({ success: false, message: MESSAGES.ORDER_THIS_ORDER_DOES_NOT });
        }

        if (order.orderStatus === 'cancelled') {
            return res.status(400).json({ success: false, message: MESSAGES.ORDER_THIS_ORDER_CANCELLED });
        }

        if (order.orderExpiresAt && new Date() > new Date(order.orderExpiresAt)) {
            order.orderStatus = 'cancelled';
            order.cancelReason = 'Payment retry window expired';
            order.cancelledAt = new Date();

            for (let item of order.items) {
                if (item.itemStatus !== 'cancelled') {
                    item.itemStatus = 'cancelled';
                    item.cancelReason = 'Payment retry window expired';
                    item.cancelledAt = new Date();

                    await Product.findOneAndUpdate(
                        { "_id": item.productId, "variants._id": item.variantId },
                        { $inc: { "variants.$.stock": item.qty } }
                    );
                }
            }
            await order.save();

            return res.status(400).json({
                success: false,
                message: "Payment retry window has expired. The order has been cancelled.",
                expired: true
            });
        }

        const validationErrors = [];

        for (const item of order.items) {
            const product = await Product.findById(item.productId);

            if (!product) {
                validationErrors.push({ productName: item.productName, error: `${item.productName} is no longer available` });
                continue;
            }

            if (!product.isListed) {
                validationErrors.push({ productName: item.productName, error: `${item.productName} has been delisted` });
                continue;
            }

            if (item.variantId) {
                const variant = product.variants.id(item.variantId);
                if (!variant) {
                    validationErrors.push({ productName: item.productName, error: `${item.productName} (${item.variantName}) variant is no longer available` });
                    continue;
                }
                if (!variant.isActive) {
                    validationErrors.push({ productName: item.productName, error: `${item.productName} (${item.variantName}) variant is inactive` });
                    continue;
                }
                if (variant.stock < 0) {
                    validationErrors.push({ productName: item.productName, error: `${item.productName} (${item.variantName}) is out of stock` });
                }
            }
        }

        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Some items have validation issues",
                errors: validationErrors
            });
        }

        return res.json({
            success: true,
            message: "Order is eligible for retry payment",
            order: {
                _id: order._id,
                orderId: order.orderId,
                finalAmount: order.finalAmount,
                items: order.items.map(i => ({
                    productName: i.productName,
                    variantName: i.variantName,
                    qty: i.qty,
                    price: i.price,
                    total: i.total
                }))
            }
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
    }
};


export const retryPayment = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.session.user });
        if (!user) return res.status(401).json({ success: false, message: MESSAGES.USER_NOT_FOUND });

        const order = await Order.findOne({ _id: req.params.id, userId: user._id });
        if (!order) return res.status(404).json({ success: false, message: MESSAGES.ORDER_NOT_FOUND });

        if (order.paymentStatus !== 'failed') {
            return res.status(400).json({ success: false, message: MESSAGES.ORDER_THIS_ORDER_DOES_NOT });
        }

        if (order.orderStatus === 'cancelled') {
            return res.status(400).json({ success: false, message: MESSAGES.ORDER_THIS_ORDER_CANCELLED });
        }

        if (order.orderExpiresAt && new Date() > new Date(order.orderExpiresAt)) {
            return res.status(400).json({ success: false, message: "Payment retry window has expired" });
        }

        const amount = order.finalAmount * 100;
        const razorpayOrder = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: `retry_${order._id}_${Date.now()}`
        });

        order.razorpayOrderId = razorpayOrder.id;
        order.retryCount = (order.retryCount || 0) + 1;
        await order.save();

        return res.json({
            success: true,
            orderId: razorpayOrder.id,
            internalOrderId: order._id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to create retry payment" });
    }
};


export const verifyRetryPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const user = await User.findOne({ email: req.session.user });
        if (!user) return res.status(401).json({ success: false, message: MESSAGES.USER_NOT_FOUND });

        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: MESSAGES.ORDER_INVALID_PAYMENT_SIGNATURE });
        }

        const order = await Order.findOne({ razorpayOrderId: razorpay_order_id, userId: user._id });
        if (!order) {
            return res.status(404).json({ success: false, message: MESSAGES.ORDER_NOT_FOUND });
        }

        order.paymentStatus = "paid";
        order.orderStatus = "pending";
        order.razorpayPaymentId = razorpay_payment_id;
        order.razorpaySignature = razorpay_signature;
        order.paymentFailedAt = undefined;
        order.orderExpiresAt = undefined;
        await order.save();

        return res.json({
            success: true,
            message: "Payment successful",
            orderId: order._id,
            redirectUrl: `/order-success/${order._id}`
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: MESSAGES.ORDER_PAYMENT_VERIFICATION_FAILED });
    }
};
