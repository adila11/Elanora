import Return from "../../model/returnSchema.js";
import Order from "../../model/orderSchema.js";
import Product from "../../model/productSchema.js";

// ── GET /admin/returns ──────────────────────────────────────────────────────
export const getReturnsPage = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.max(1, parseInt(req.query.limit) || 10);
        const skip  = (page - 1) * limit;

        const totalCount = await Return.countDocuments();

        const rawReturns = await Return.find()
            .populate("userId")
            .populate("orderId")
            .sort({ requestedAt: -1 })
            .skip(skip)
            .limit(limit);

        const returns = rawReturns.map(r => {
            const order = r.orderId;
            const user  = r.userId;

            const orderItem = order?.items?.id
                ? order.items.id(r.itemId)
                : order?.items?.find(i => String(i._id) === String(r.itemId));

            return {
                _id:           r._id,
                orderId:       order?.orderId                    ?? "N/A",
                customerName:  order?.shippingAddress?.fullName  ?? user?.name  ?? "N/A",
                customerPhone: order?.shippingAddress?.phone     ?? user?.phone ?? "—",
                product:       orderItem?.productName            ?? "N/A",
                variant:       orderItem?.variantName            ?? "",
                price:         orderItem?.price                  ?? r.refundAmount ?? 0,
                quantity:      orderItem?.qty                    ?? 1,
                image:         orderItem?.productImage           ?? "",
                reason:        r.reason,
                status:        r.status,
                refundAmount:  r.refundAmount,
                date:          r.requestedAt,
            };
        });

        const totalPages = Math.ceil(totalCount / limit);

        res.render("admin/return", {
            returns,
            title: "Returns",
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

    } catch (error) {
        console.log(error);
        res.redirect("/admin/pageerror");
    }
};


// ── PATCH /admin/returns/:id/approve ──────────────────────────────────────
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

        returnRequest.status      = "approved";
        returnRequest.processedAt = new Date();
        await returnRequest.save();

        const order = await Order.findById(returnRequest.orderId);
        if (order) {
            const item = order.items.id(returnRequest.itemId);
            if (item) {
                const oldStatus   = item.itemStatus;
                item.itemStatus   = "returned";
                item.returnedAt   = new Date();
                item.returnReason = returnRequest.reason;

                if (oldStatus !== "returned" && oldStatus !== "cancelled") {
                    await Product.findOneAndUpdate(
                        { "_id": item.productId, "variants._id": item.variantId },
                        { $inc: { "variants.$.stock": item.qty } }
                    );
                }
            }
            await order.save();
        }

        res.json({ success: true, message: "Return approved" });

    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
};


// ── PATCH /admin/returns/:id/reject ───────────────────────────────────────
export const rejectReturn = async (req, res) => {
    try {
        const { id }          = req.params;
        const { adminRemark } = req.body;

        const returnRequest = await Return.findById(id);
        if (!returnRequest) {
            return res.status(404).json({ success: false, message: "Return request not found" });
        }
        if (returnRequest.status !== "pending") {
            return res.status(400).json({ success: false, message: "Return already processed" });
        }

        returnRequest.status      = "rejected";
        returnRequest.processedAt = new Date();
        if (adminRemark) returnRequest.adminRemark = adminRemark;
        await returnRequest.save();

        res.json({ success: true, message: "Return rejected" });

    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
};