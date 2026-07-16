import Return from "../../model/returnSchema.js";
import Order from "../../model/orderSchema.js";
import Product from "../../model/productSchema.js";
import { creditWallet } from "../../utils/walletHelper.js";

export const getReturnsPage = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, parseInt(req.query.limit) || 10);
        const skip = (page - 1) * limit;

        const totalCount = await Return.countDocuments();

        const rawReturns = await Return.find()
            .populate("userId")
            .populate("orderId")
            .sort({ requestedAt: -1 })
            .skip(skip)
            .limit(limit);

        const returns = rawReturns.map(r => {
            const order = r.orderId;
            const user = r.userId;

            const orderItem = order?.items?.id
                ? order.items.id(r.itemId)
                : order?.items?.find(i => String(i._id) === String(r.itemId));

            return {
                _id: r._id,
                orderId: order?.orderId ?? "N/A",
                customerName: order?.shippingAddress?.fullName ?? user?.name ?? "N/A",
                customerPhone: order?.shippingAddress?.phone ?? user?.phone ?? "—",
                product: orderItem?.productName ?? "N/A",
                variant: orderItem?.variantName ?? "",
                price: orderItem?.price ?? r.refundAmount ?? 0,
                quantity: orderItem?.qty ?? 1,
                image: orderItem?.productImage ?? "",
                reason: r.reason,
                status: r.status,
                refundAmount: r.refundAmount,
                date: r.requestedAt,
            };
        });

        const totalPages = Math.ceil(totalCount / limit);

        res.render("admin/return", {
            returns,
            title: "Returns",
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

    } catch (error) {
        console.log(error);
        res.redirect("/admin/pageerror");
    }
};


export const approveReturn = async (req, res) => {
    try {
        const { id } = req.params;

        const returnRequest = await Return.findById(id);
        if (!returnRequest) {
            return res.status(404).json({ success: false, message: "Return request not found" });
        }
        if (returnRequest.status !== "pending") {
            return res.status(400).json({ success: false, message: "Return already processed" });
        }

        returnRequest.status = "approved";
        returnRequest.processedAt = new Date();
        await returnRequest.save();

        const order = await Order.findById(returnRequest.orderId);
        if (order) {
            const item = order.items.id(returnRequest.itemId);
            if (item) {
                const oldStatus = item.itemStatus;
                item.itemStatus = "returned";
                item.returnReason = returnRequest.reason;
                item.returnApprovedAt = new Date();
                item.returnedAt = new Date();

                if (oldStatus !== "returned" && oldStatus !== "cancelled") {
                    await Product.findOneAndUpdate(
                        { "_id": item.productId, "variants._id": item.variantId },
                        { $inc: { "variants.$.stock": item.qty } }
                    );

                    order.orderTotal -= item.total;
                    order.finalAmount -= item.total;
                }
            }

            if (order.paymentStatus === "paid") {

                await creditWallet({
                    userId: order.userId,
                    amount: returnRequest.refundAmount,
                    source: "order_return",
                    orderId: order._id,
                    description: `Refund for returned item in order ${order.orderId}`
                });

                const allReturned = order.items.every(item =>
                    item.itemStatus === "returned" ||
                    item.itemStatus === "cancelled"
                );

                if (allReturned) {
                    order.paymentStatus = "refunded";
                    order.orderStatus = "returned";

                    // Restore original totals when the order is completely returned, avoiding ₹0 total displays
                    const originalSubtotal = order.items.reduce((sum, item) => sum + item.total, 0);
                    order.orderTotal = originalSubtotal;
                    order.finalAmount = originalSubtotal + (order.deliveryCharge || 0) - (order.discount || 0);
                }

            }

            await order.save();
        }

        res.json({
            success: true,
            message: `Return approved. ₹${returnRequest.refundAmount} refunded to user's wallet.`
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
};


export const rejectReturn = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminRemark } = req.body;

        const returnRequest = await Return.findById(id);
        if (!returnRequest) {
            return res.status(404).json({ success: false, message: "Return request not found" });
        }
        if (returnRequest.status !== "pending") {
            return res.status(400).json({ success: false, message: "Return already processed" });
        }

        returnRequest.status = "rejected";
        returnRequest.processedAt = new Date();
        if (adminRemark) returnRequest.adminRemark = adminRemark;
        await returnRequest.save();

        const order = await Order.findById(returnRequest.orderId);
        if (order) {
            const item = order.items.id(returnRequest.itemId);
            if (item) {
                item.itemStatus = "return_rejected";
                item.returnRejectedAt = new Date();
                item.returnRejectReason = adminRemark || "";
            }
            await order.save();
        }

        res.json({ success: true, message: "Return rejected" });

    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
};