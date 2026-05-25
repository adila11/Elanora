import Order from "../../model/orderSchema.js";
import { User } from "../../model/userSchema.js";

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

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        let query = {};

        // 1. Filter by status
        if (status) {
            if (status === 'Processing') {
                query.orderStatus = { $in: ['confirmed', 'packed'] };
            } else if (status === 'Pending') {
                query.orderStatus = 'pending';
            } else if (status === 'Shipped') {
                query.orderStatus = 'shipped';
            } else if (status === 'Out for Delivery') {
                query.orderStatus = 'out_for_delivery';
            } else if (status === 'Delivered') {
                query.orderStatus = 'delivered';
            } else if (status === 'Cancelled') {
                query.orderStatus = 'cancelled';
            } else if (status === 'Returned') {
                query.orderStatus = 'returned';
            }
        }

        // 2. Filter by payment status
        if (payment) {
            query.paymentStatus = payment.toLowerCase();
        }

        // 3. Search filter
        if (search) {
            // Find users matching search name
            const matchingUsers = await User.find({
                fullName: { $regex: search, $options: 'i' }
            }).select('_id');
            const userIds = matchingUsers.map(u => u._id);

            query.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { userId: { $in: userIds } }
            ];
        }

        // 4. Sort options
        let sortOption = {};
        if (sortField === 'id') {
            sortOption = { orderId: sortOrder === 'asc' ? 1 : -1 };
        } else if (sortField === 'amount') {
            sortOption = { finalAmount: sortOrder === 'asc' ? 1 : -1 };
        } else if (sortField === 'date') {
            sortOption = { createdAt: sortOrder === 'asc' ? 1 : -1 };
        } else if (sortField === 'customer') {
            sortOption = { userId: sortOrder === 'asc' ? 1 : -1 };
        } else {
            sortOption = { createdAt: -1 };
        }

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limitNum);

        const dbOrders = await Order.find(query)
            .populate("userId", "fullName email")
            .sort(sortOption)
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean();

        const orders = dbOrders.map(order => ({
            id: order.orderId,
            customer: order.userId?.fullName || "Unknown User",
            amount: order.finalAmount,
            payment: capitalize(order.paymentStatus),
            status: formatOrderStatus(order.orderStatus),
            date: order.createdAt,
            phone: order.shippingAddress?.phone || "N/A",
            address:
                `${order.shippingAddress?.addressLine || ""}, 
                 ${order.shippingAddress?.city || ""}, 
                 ${order.shippingAddress?.state || ""}`,
            items:
                order.items?.map(item => ({
                    name: item.productName || "Product",
                    qty: item.qty,
                    price: item.price
                })) || []
        }));

        const statusSelectClass = (s) => {
            switch (s) {
                case 'Pending': return 'pending';
                case 'Processing': return 'processing';
                case 'Shipped': return 'shipped';
                case 'Out for Delivery': return 'out';
                case 'Delivered': return 'delivered';
                case 'Cancelled': return 'cancelled';
                default: return 'pending';
            }
        };

        res.render("admin/order", {
            orders,
            currentStatus: status,
            currentPayment: payment,
            search,
            totalOrders,
            currentPage: pageNum,
            limit: limitNum,
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
        pending: "Pending",
        confirmed: "Processing",
        packed: "Processing",
        shipped: "Shipped",
        out_for_delivery: "Out for Delivery",
        delivered: "Delivered",
        cancelled: "Cancelled",
        returned: "Returned"
    };

    return statusMap[status] || "Pending";
}



export const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const existingOrder = await Order.findOne({ orderId: orderId });
        if (!existingOrder) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        if (['delivered', 'cancelled', 'returned'].includes(existingOrder.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: "Status cannot be changed after the order has been delivered, cancelled, or returned."
            });
        }

        const statusMap = {
            "Pending": "pending",
            "Processing": "processing",
            "Shipped": "shipped",
            "Out for Delivery": "out_for_delivery",
            "Delivered": "delivered",
            "Cancelled": "cancelled"
        };

        const dbStatus = statusMap[status];
        if (!dbStatus) {
            return res.status(400).json({
                success: false,
                message: "Invalid status value."
            });
        }
        
 
        existingOrder.orderStatus = dbStatus;
        console.log(existingOrder.orderStatus)
        if (dbStatus === 'delivered') {
            existingOrder.deliveredAt = new Date();
            existingOrder.paymentStatus = 'paid';
        } else if (dbStatus === 'cancelled') {
            existingOrder.cancelledAt = new Date();
        }

        await existingOrder.save();

        res.json({
            success: true
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "An error occurred while updating the status."
        });
    }
};

