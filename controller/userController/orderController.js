import Order from "../../model/orderSchema.js";
import Address from "../../model/addressSchema.js";
import Cart from "../../model/cartSchema.js";
import Product from "../../model/productSchema.js";
import Return from "../../model/returnSchema.js";
import { User } from "../../model/userSchema.js";


export const getOrders = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const user = await User.findOne({ email: req.session.user });
        if (!user) return res.redirect('/login');

        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.max(1, parseInt(req.query.limit) || 5);
        const skip  = (page - 1) * limit;

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
                currentPage:  page,
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
        console.error(err);
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
        if (!order) return res.status(404).send("Order not found");

        const returnRequests = await Return.find({ orderId: order._id });

        const orderObj = order.toObject();
        orderObj.items.forEach(item => {
            const rr = returnRequests.find(r => r.itemId.toString() === item._id.toString());
            item.returnRequest = rr || null;
        });

        res.render("user/order/orderDetail", { order: orderObj, user });

    } catch (error) {
        console.log("Get order detail error:", error);
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
                item.itemStatus  = "cancelled";
                item.cancelReason = reason || "";
                item.cancelledAt  = new Date();

                await Product.findOneAndUpdate(
                    { "_id": item.productId, "variants._id": item.variantId },
                    { $inc: { "variants.$.stock": item.qty } }
                );
            }
        }

        await order.save();

        return res.status(200).json({ success: true, message: "Order cancelled successfully" });

    } catch (error) {
        console.log("Cancel full order error:", error);
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

        const blockedStatuses = ['shipped', 'out_for_delivery', 'delivered'];
        if (blockedStatuses.includes(order.orderStatus)) {
            return res.status(400).json({ success: false, message: "Cannot cancel after shipped" });
        }

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ success: false, message: "Item not found" });

        if (item.itemStatus !== "cancelled" && item.itemStatus !== "returned") {
            item.itemStatus  = "cancelled";
            item.cancelReason = reason;
            item.cancelledAt  = new Date();

            await Product.findOneAndUpdate(
                { "_id": item.productId, "variants._id": item.variantId },
                { $inc: { "variants.$.stock": item.qty } }
            );

            order.orderTotal  -= item.total;
            order.finalAmount -= item.total;
        }

        const activeItems = order.items.filter(
            i => i.itemStatus !== "cancelled" && i.itemStatus !== "returned"
        );
        if (activeItems.length === 0) order.orderStatus = "cancelled";

        await order.save();

        res.json({ success: true, message: "Item cancelled successfully" });

    } catch (error) {
        console.log("Cancel item error:", error);
        res.status(500).json({ success: false });
    }
};


export const returnItem = async (req, res) => {
    try {
        const { orderId, itemId, reason } = req.body;

        const user = await User.findOne({ email: req.session.user });
        if (!user) return res.status(401).json({ success: false, message: "User not found" });

        const order = await Order.findOne({ _id: orderId, userId: user._id });
        if (!order) return res.status(404).json({ success: false });

        if (order.orderStatus !== "delivered") {
            return res.status(400).json({ success: false, message: "Return allowed only after delivery" });
        }

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ success: false, message: "Item not found" });

        if (item.itemStatus !== "active") {
            return res.status(400).json({ success: false, message: "This item cannot be returned" });
        }

        const existingReturn = await Return.findOne({ orderId, itemId });
        if (existingReturn) {
            return res.status(400).json({ success: false, message: "Return request already submitted" });
        }

        await Return.create({ orderId, itemId, userId: user._id, reason, refundAmount: item.total });

        res.json({ success: true, message: "Return request submitted" });

    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false });
    }
};