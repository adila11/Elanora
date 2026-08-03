import Order from "../../model/orderSchema.js";
import PDFDocument from "pdfkit";

export const exportLedger = async (req, res) => {
  try {
    const orders = await Order.find({ paymentStatus: "paid" })
      .populate("userId", "fullName email")
      .sort({ createdAt: -1 })
      .lean();

    const doc = new PDFDocument({ margin: 40, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Elanora_Ledger_${Date.now()}.pdf"`);
    doc.pipe(res);

    doc.fontSize(22).font("Helvetica-Bold").fillColor("#1a1a18").text("ELANORA", 40, 40);
    doc.fontSize(10).font("Helvetica").fillColor("#7a7870").text("Ledger Book — All Paid Transactions", 40, 66);
    doc.fontSize(9).text(`Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`, 40, 80);

    doc.moveTo(40, 100).lineTo(555, 100).strokeColor("#e8e6e0").lineWidth(1).stroke();

    const cols = { date: 40, orderId: 105, customer: 215, payment: 340, amount: 460, status: 510 };
    const rowH = 20;
    let y = 115;

    doc.fontSize(8).font("Helvetica-Bold").fillColor("#7a7870");
    doc.text("DATE",        cols.date,     y);
    doc.text("ORDER ID",    cols.orderId,  y);
    doc.text("CUSTOMER",    cols.customer, y);
    doc.text("PAYMENT",     cols.payment,  y);
    doc.text("AMOUNT",      cols.amount,   y, { align: "right", width: 45 });
    doc.text("STATUS",      cols.status,   y);

    y += 14;
    doc.moveTo(40, y).lineTo(555, y).strokeColor("#e8e6e0").lineWidth(0.5).stroke();
    y += 8;

    let totalRevenue = 0;
    let rowNum = 0;

    for (const order of orders) {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }

      if (rowNum % 2 === 0) {
        doc.rect(40, y - 3, 515, rowH).fill("#faf9f6");
      }

      const dateStr = new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const customerName = order.userId?.fullName || "Guest";
      const payMethod = (order.paymentMethod || "—").toUpperCase();
      const amount = order.finalAmount || 0;
      const status = order.orderStatus || "—";

      doc.fontSize(8).font("Helvetica").fillColor("#1a1a18");
      doc.text(dateStr,                    cols.date,     y, { width: 60 });
      doc.text(`#${order.orderId}`,        cols.orderId,  y, { width: 105 });
      doc.text(customerName.slice(0, 18),  cols.customer, y, { width: 120 });
      doc.text(payMethod.slice(0, 12),     cols.payment,  y, { width: 110 });
      doc.text(`Rs.${amount.toLocaleString("en-IN")}`, cols.amount, y, { align: "right", width: 45 });
      doc.fillColor("#2d7a4f").text(status.replace(/_/g, " "), cols.status, y, { width: 60 });
      doc.fillColor("#1a1a18");

      totalRevenue += amount;
      y += rowH;
      rowNum++;
    }

    y += 10;
    doc.moveTo(40, y).lineTo(555, y).strokeColor("#c8a96e").lineWidth(1).stroke();
    y += 12;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#1a1a18");
    doc.text(`Total Transactions: ${orders.length}`, 40, y);
    doc.text(`Total Revenue: Rs.${totalRevenue.toLocaleString("en-IN")}`, 350, y, { align: "right", width: 205 });

    y += 30;
    doc.fontSize(8).font("Helvetica").fillColor("#7a7870")
      .text("This is a system-generated ledger. For queries contact finance@elanora.com", 40, y, { align: "center", width: 515 });

    doc.end();
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to generate ledger" });
  }
};
