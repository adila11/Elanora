import Order from "../../model/orderSchema.js";
import { User } from "../../model/userSchema.js";
import Product from "../../model/productSchema.js";

export const getOrdersPage = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status = "",
            payment = "",
            search = "",
            sortField = "date",
            sortOrder = "desc"
        } = req.query;

        const pageNum  = parseInt(page);
        const limitNum = parseInt(limit);

        let query = {};

        if (status)  query.orderStatus   = status;
        if (payment) query.paymentStatus = payment.toLowerCase();

        if (search) {
            const matchingUsers = await User.find({
                fullName: { $regex: search, $options: 'i' }
            }).select('_id');
            const userIds = matchingUsers.map(u => u._id);
            query.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { userId:  { $in: userIds } }
            ];
        }

        let sortOption = {};
        if      (sortField === 'id')       sortOption = { orderId:     sortOrder === 'asc' ? 1 : -1 };
        else if (sortField === 'amount')   sortOption = { finalAmount: sortOrder === 'asc' ? 1 : -1 };
        else if (sortField === 'date')     sortOption = { createdAt:   sortOrder === 'asc' ? 1 : -1 };
        else if (sortField === 'customer') sortOption = { userId:      sortOrder === 'asc' ? 1 : -1 };
        else                               sortOption = { createdAt: -1 };

        const totalOrders = await Order.countDocuments(query);
        const totalPages  = Math.ceil(totalOrders / limitNum);

        const dbOrders = await Order.find(query)
            .populate("userId", "fullName email")
            .sort(sortOption)
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean();

        const orders = dbOrders.map(order => ({
            id:       order.orderId,
            customer: order.userId?.fullName || "Unknown User",
            amount:   order.finalAmount,
            payment:  capitalize(order.paymentStatus),
            status:   formatOrderStatus(order.orderStatus),
            date:     order.createdAt,
            phone:    order.shippingAddress?.phone || "N/A",
            address:  `${order.shippingAddress?.addressLine || ""}, ${order.shippingAddress?.city || ""}, ${order.shippingAddress?.state || ""}`,
            items:    order.items?.map(item => ({
                name:  item.productName || "Product",
                qty:   item.qty,
                price: item.price
            })) || []
        }));

        const statusSelectClass = (s) => {
            switch (s) {
                case 'Pending':         return 'pending';
                case 'Processing':      return 'processing';
                case 'Shipped':         return 'shipped';
                case 'Out for Delivery':return 'out';
                case 'Delivered':       return 'delivered';
                case 'Cancelled':       return 'cancelled';
                case 'Returned':        return 'returned';
                default:                return 'pending';
            }
        };

        res.render("admin/orderList", {
            orders,
            currentStatus:  status,
            currentPayment: payment,
            search,
            totalOrders,
            currentPage: pageNum,
            limit:       limitNum,
            totalPages,
            sortField,
            sortOrder,
            statusSelectClass,
            title: "Orders"
        });

    } catch (error) {
        console.log("Order page error:", error);
        res.redirect("/admin/pageerror");
    }
};


function capitalize(text) {
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatOrderStatus(status) {
    const statusMap = {
        pending:          'Pending',
        processing:       'Processing',
        shipped:          'Shipped',
        out_for_delivery: 'Out for Delivery',
        delivered:        'Delivered',
        cancelled:        'Cancelled',
        returned:         'Returned'
    };
    return statusMap[status] || 'Pending';
}

const STATUS_MAP = {
    'Pending':          'pending',
    'Processing':       'processing',
    'Shipped':          'shipped',
    'Out for Delivery': 'out_for_delivery',
    'Delivered':        'delivered',
    'Cancelled':        'cancelled',
    'Returned':         'returned',

    pending:          'pending',
    processing:       'processing',
    shipped:          'shipped',
    out_for_delivery: 'out_for_delivery',
    delivered:        'delivered',
    cancelled:        'cancelled',
    returned:         'returned'
};

const ALLOWED_TRANSITIONS = {
    pending:          ['processing','shipped','out_for_delivery','delivered','cancelled','returned'],
    processing:       ['shipped','out_for_delivery','delivered','cancelled','returned'],
    shipped:          ['out_for_delivery','delivered','cancelled','returned'],
    out_for_delivery: ['delivered','cancelled','returned'],
    delivered:        [],
    cancelled:        [],
    returned:         []
};


export const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status }  = req.body;

        const existingOrder = await Order.findOne({ orderId });
        if (!existingOrder) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        if (['delivered','cancelled','returned'].includes(existingOrder.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: "Status cannot be changed after the order has been delivered, cancelled, or returned."
            });
        }

        const dbStatus = STATUS_MAP[status];
        if (!dbStatus) {
            return res.status(400).json({ success: false, message: "Invalid status value." });
        }

        const currentStatus = existingOrder.orderStatus;
        if (currentStatus !== dbStatus && !ALLOWED_TRANSITIONS[currentStatus]?.includes(dbStatus)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status transition from ${currentStatus} to ${dbStatus}.`
            });
        }

        existingOrder.orderStatus = dbStatus;

        if (dbStatus === 'delivered') {
            existingOrder.deliveredAt  = new Date();
            existingOrder.paymentStatus = 'paid';
        } else if (dbStatus === 'cancelled') {
            existingOrder.cancelledAt = new Date();
            for (let item of existingOrder.items) {
                if (item.itemStatus !== 'cancelled' && item.itemStatus !== 'returned') {
                    item.itemStatus = 'cancelled';
                    item.cancelledAt = new Date();
                    await Product.findOneAndUpdate(
                        { "_id": item.productId, "variants._id": item.variantId },
                        { $inc: { "variants.$.stock": item.qty } }
                    );
                }
            }
            const originalSubtotal = existingOrder.items.reduce((sum, item) => sum + item.total, 0);
            existingOrder.orderTotal = originalSubtotal;
            existingOrder.finalAmount = originalSubtotal + (existingOrder.deliveryCharge || 0) - (existingOrder.discount || 0);
        } else if (dbStatus === 'returned') {
            for (let item of existingOrder.items) {
                if (item.itemStatus !== 'cancelled' && item.itemStatus !== 'returned') {
                    item.itemStatus = 'returned';
                    item.returnedAt = new Date();
                    await Product.findOneAndUpdate(
                        { "_id": item.productId, "variants._id": item.variantId },
                        { $inc: { "variants.$.stock": item.qty } }
                    );
                }
            }
            const originalSubtotal = existingOrder.items.reduce((sum, item) => sum + item.total, 0);
            existingOrder.orderTotal = originalSubtotal;
            existingOrder.finalAmount = originalSubtotal + (existingOrder.deliveryCharge || 0) - (existingOrder.discount || 0);
        }

        await existingOrder.save();
        return res.json({ success: true });

    } catch (error) {
        console.error("updateOrderStatus error:", error);
        return res.status(500).json({ success: false, message: "An error occurred while updating the status." });
    }
};


export const updateItemStatus = async (req, res) => {
    try {
        const { orderId }        = req.params;
        const { itemId, status } = req.body;

        const existingOrder = await Order.findOne({ orderId });
        if (!existingOrder) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        const item = existingOrder.items.find(
            i => String(i._id) === String(itemId) || String(i.productId) === String(itemId)
        );

        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found in this order." });
        }

        const currentItemStatus = (item.itemStatus && item.itemStatus !== 'active')
            ? item.itemStatus
            : (existingOrder.orderStatus || 'pending');

        if (['delivered','cancelled','returned'].includes(currentItemStatus)) {
            return res.status(400).json({
                success: false,
                message: "Item status is final and cannot be changed."
            });
        }

        const dbStatus = STATUS_MAP[status];
        if (!dbStatus) {
            return res.status(400).json({ success: false, message: "Invalid status value." });
        }

        if (currentItemStatus !== dbStatus && !ALLOWED_TRANSITIONS[currentItemStatus]?.includes(dbStatus)) {
            return res.status(400).json({
                success: false,
                message: `Invalid item status transition from ${currentItemStatus} to ${dbStatus}.`
            });
        }

        const oldStatus = item.itemStatus || 'active';
        item.itemStatus = dbStatus;

        if (dbStatus === 'cancelled') {
            item.cancelledAt = new Date();
        } else if (dbStatus === 'returned') {
            item.returnedAt = new Date();
        }

        if ((dbStatus === 'cancelled' || dbStatus === 'returned') && oldStatus !== 'cancelled' && oldStatus !== 'returned') {
            await Product.findOneAndUpdate(
                { "_id": item.productId, "variants._id": item.variantId },
                { $inc: { "variants.$.stock": item.qty } }
            );

            existingOrder.orderTotal -= item.total;
            existingOrder.finalAmount -= item.total;
        }

        const activeItems = existingOrder.items.filter(
            i => i.itemStatus !== "cancelled" && i.itemStatus !== "returned"
        );
        if (activeItems.length === 0) {
            existingOrder.orderStatus = dbStatus; 
            const originalSubtotal = existingOrder.items.reduce((sum, item) => sum + item.total, 0);
            existingOrder.orderTotal = originalSubtotal;
            existingOrder.finalAmount = originalSubtotal + (existingOrder.deliveryCharge || 0) - (existingOrder.discount || 0);
        }

        await existingOrder.save();

        return res.json({ success: true });

    } catch (error) {
        console.error("updateItemStatus error:", error);
        return res.status(500).json({ success: false, message: "An error occurred while updating the item status." });
    }
};


export const getOrderDetail = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findOne({ orderId })
            .populate('userId', 'name email')
            .lean();

        if (!order) {
            return res.status(404).render('admin/404', { message: 'Order not found' });
        }

        order.user = order.userId;

        res.render('admin/orderDetail', { order, title: "Order Details" });
    } catch (err) {
        console.error('getOrderDetail error:', err);
        res.status(500).render('admin/error', { message: 'Server error' });
    }
};