import Return from "../../model/returnSchema.js";
import Order from "../../model/orderSchema.js";

// ── GET /admin/returns ──────────────────────────────────────────────────────
export const getReturnsPage = async (req, res) => {
    try {

        const rawReturns = await Return.find()
            .populate("userId")
            .populate("orderId")
            .sort({ requestedAt: -1 });

        const returns = rawReturns.map(r => {

            const order = r.orderId;   // populated Order document
            const user = r.userId;    // populated User document

            // Match the exact item in order.items[] using r.itemId
            const orderItem = order?.items?.id
                ? order.items.id(r.itemId)
                : order?.items?.find(i => String(i._id) === String(r.itemId));

            return {
                _id: r._id,

                // ── Order & Customer ──────────────────────────────
                orderId: order?.orderId ?? 'N/A',
                customerName: order?.shippingAddress?.fullName ?? user?.name ?? 'N/A',
                customerPhone: order?.shippingAddress?.phone ?? user?.phone ?? '—',

                // ── Product (exact field names from orderItemSchema) ──
                product: orderItem?.productName ?? 'N/A',
                variant: orderItem?.variantName ?? '',
                price: orderItem?.price ?? r.refundAmount ?? 0,
                quantity: orderItem?.qty ?? 1,
                image: orderItem?.productImage ?? '',

                // ── Return meta ───────────────────────────────────
                reason: r.reason,
                status: r.status,
                refundAmount: r.refundAmount,
                date: r.requestedAt,   // requestedAt from returnSchema
            };
        });

        res.render("admin/return", { returns, title: "Returns" });

    } catch (error) {
        console.log(error);
        res.redirect("/admin/pageerror");
    }
};


// ── PATCH /admin/returns/:id  →  approve ──────────────────────────────────
export const approveReturn = async (req, res) => {
    try {

        const { id } = req.params;

        const returnRequest = await Return.findById(id);

        if (!returnRequest) {
            return res.status(404).json({
                success: false,
                message: "Return request not found"
            });
        }

        if (returnRequest.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "Return already processed"
            });
        }

        returnRequest.status = "approved";
        returnRequest.processedAt = new Date();
        await returnRequest.save();

        // Update the matching item's itemStatus inside the order
        const order = await Order.findById(returnRequest.orderId);
        if (order) {
            const item = order.items.id(returnRequest.itemId);
            if (item) {
                item.itemStatus = "returned";
                item.returnedAt = new Date();
                item.returnReason = returnRequest.reason;
            }
            await order.save();
        }

        res.json({ success: true, message: "Return approved" });

    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
};


// ── PATCH /admin/returns/:id  →  reject ───────────────────────────────────
export const rejectReturn = async (req, res) => {
    try {

        const { id } = req.params;
        const { adminRemark } = req.body;
        const returnRequest = await Return.findById(id);

        if (!returnRequest) {
            return res.status(404).json({
                success: false,
                message: "Return request not found"
            });
        }

        if (returnRequest.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "Return already processed"
            });
        }

        returnRequest.status = "rejected";
        returnRequest.processedAt = new Date();
        if (adminRemark) {
            returnRequest.adminRemark = adminRemark;
        }
        await returnRequest.save();

        res.json({ success: true, message: "Return rejected" });

    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
};