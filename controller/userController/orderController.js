import Order from "../../model/orderSchema.js";
import Address from "../../model/addressSchema.js";
import Cart from "../../model/cartSchema.js";
import Product from "../../model/productSchema.js";
import Return from "../../model/returnSchema.js";
import { User } from "../../model/userSchema.js";
import { creditWallet } from "../../utils/walletHelper.js";
import { revalidateCouponAgainstCart, cancelOrderDueToCouponBreach } from "../../utils/couponValidator.js";


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
        res.status(500).send('Server Error');
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
        // Invalid ObjectId format → treat as 404
        if (error.name === 'CastError') {
            return res.status(404).render("user/profile/pageNotFound");
        }
        res.status(500).send("Server Error");
    }
};


export const cancelFullOrder = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { reason } = req.body;

        const user = await User.findOne({ email: req.session.user });
        if (!user) return res.status(401).json({ success: false, message: "User not found" });

        const order = await Order.findOne({ _id: orderId, userId: user._id });
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        const blockedStatuses = ["shipped", "out_for_delivery", "delivered"];
        if (blockedStatuses.includes(order.orderStatus)) {
            return res.status(400).json({ success: false, message: "Order cannot be cancelled after shipping" });
        }

        if (order.orderStatus === "cancelled") {
            return res.status(400).json({ success: false, message: "Order already cancelled" });
        }

        order.orderStatus = "cancelled";
        order.cancelReason = reason || "";
        order.cancelledAt = new Date();

        for (let item of order.items) {
            if (item.itemStatus !== "cancelled" && item.itemStatus !== "returned") {
                item.itemStatus = "cancelled";
                item.cancelReason = reason || "";
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
        return res.status(500).json({ success: false, message: "Server Error" });
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
                message: "Item not found"
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
                    message: `Full order cancelled and refunded to your wallet due to coupon minimum purchase requirement breach.`,
                    autoCancelledOrder: true,
                });
            }
        }

        if (item.itemStatus !== "cancelled" && item.itemStatus !== "returned") {
            item.itemStatus = "cancelled";
            item.cancelReason = reason;
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
                message: "User not found"
            });
        }

        const order = await Order.findOne({
            _id: orderId,
            userId: user._id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
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
                message: "Item not found"
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
            message: "Server Error"
        });

    }
};


