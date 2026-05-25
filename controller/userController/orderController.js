import Order from "../../model/orderSchema.js";
import Address from "../../model/addressSchema.js";
import Cart from "../../model/cartSchema.js";
import Product from "../../model/productSchema.js";
import {User} from "../../model/userSchema.js";  



export const getOrders = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const user = await User.findOne({ email: req.session.user });
    if (!user) return res.redirect('/login');

    const orders = await Order.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .populate('items.productId', 'name variants');

    res.render('user/order/orderList', {
      user,          // pass the full user object, not just the email
      orders,
      title: 'My Orders'
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

        const user = await User.findOne({
            email: req.session.user
        });

        if (!user) {
            return res.redirect("/login");
        }

        const order = await Order.findOne({
            _id: req.params.id,
            userId: user._id
        });

        if (!order) {
            return res.status(404).send("Order not found");
        }

        res.render("user/order/orderDetail", {
            order,
            user
        });

    } catch (error) {

        console.log("Get order detail error:", error);

        res.status(500).send("Server Error");

    }

};

export const cancelFullOrder = async (req, res) => {

    try {

        const { orderId, reason } = req.body;

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

        // DON'T ALLOW AFTER SHIPPED
        const blockedStatuses = [
            'shipped',
            'out_for_delivery',
            'delivered'
        ];

        if (blockedStatuses.includes(order.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: "Order cannot be cancelled"
            });
        }

        order.orderStatus = "cancelled";
        order.cancelReason = reason;
        order.cancelledAt = new Date();

        // cancel all items
        order.items.forEach(item => {
            item.itemStatus = "cancelled";
            item.cancelReason = reason;
            item.cancelledAt = new Date();
        });

        await order.save();

        res.json({
            success: true,
            message: "Order cancelled successfully"
        });

    } catch (error) {

        console.log("Cancel full order error:", error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};

export const cancelSingleItem = async (req, res) => {

    try {

        const { orderId, itemId, reason } = req.body;

        const user = await User.findOne({
            email: req.session.user
        });

        if (!user) {
            return res.status(401).json({
                success: false
            });
        }

        const order = await Order.findOne({
            _id: orderId,
            userId: user._id
        });

        if (!order) {
            return res.status(404).json({
                success: false
            });
        }

        const blockedStatuses = [
            'shipped',
            'out_for_delivery',
            'delivered'
        ];

        if (blockedStatuses.includes(order.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: "Cannot cancel after shipped"
            });
        }

        const item = order.items.id(itemId);

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Item not found"
            });
        }

        item.itemStatus = "cancelled";
        item.cancelReason = reason;
        item.cancelledAt = new Date();

        // RECALCULATE TOTAL
        order.orderTotal -= item.total;
        order.finalAmount -= item.total;

        // CHECK ALL ITEMS CANCELLED
        const activeItems = order.items.filter(
            item => item.itemStatus === "active"
        );

        if (activeItems.length === 0) {
            order.orderStatus = "cancelled";
        }

        await order.save();

        res.json({
            success: true,
            message: "Item cancelled successfully"
        });

    } catch (error) {

        console.log("Cancel item error:", error);

        res.status(500).json({
            success: false
        });

    }

};

export const returnItem = async (req, res) => {

    try {

        const { orderId, itemId, reason } = req.body;

        const user = await User.findOne({
            email: req.session.user
        });

        const order = await Order.findOne({
            _id: orderId,
            userId: user._id
        });

        if (!order) {
            return res.status(404).json({
                success: false
            });
        }

        if (order.orderStatus !== "delivered") {
            return res.status(400).json({
                success: false,
                message: "Return allowed only after delivery"
            });
        }

        const item = order.items.id(itemId);

        if (!item) {
            return res.status(404).json({
                success: false
            });
        }

        item.itemStatus = "returned";
        item.returnReason = reason;
        item.returnedAt = new Date();

        await order.save();

        res.json({
            success: true,
            message: "Return request submitted"
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false
        });

    }

};

