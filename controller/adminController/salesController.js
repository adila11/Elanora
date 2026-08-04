import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import Order from "../../model/orderSchema.js";
import Return from "../../model/returnSchema.js";
import WalletTransaction from "../../model/walletTransactionSchema.js";

const REVENUE_EXCLUDED_STATUSES = ["cancelled", "return_rejected"];


function getDateRange(query) {
  const now = new Date();
  const range = query.range || "30d";

  let start, end, groupBy = "day";

  if (range === "custom" && query.startDate && query.endDate) {
    start = new Date(query.startDate);
    start.setHours(0, 0, 0, 0);
    end = new Date(query.endDate);
    end.setHours(23, 59, 59, 999);
  } else {
    end = new Date(now);
    end.setHours(23, 59, 59, 999);
    start = new Date(now);

    switch (range) {
      case "today":
        break;
      case "7d":
        start.setDate(start.getDate() - 6);
        break;
      case "1y":
        start.setFullYear(start.getFullYear() - 1);
        start.setDate(start.getDate() + 1);
        groupBy = "month";
        break;
      case "30d":
      default:
        start.setDate(start.getDate() - 29);
        break;
    }
    start.setHours(0, 0, 0, 0);
  }

  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  return { start, end, prevStart, prevEnd, groupBy, range };
}


// ── Helper: compute net final amount actually paid ───────────────────────
const computeFinal = (o) => {
  const total = o.items?.reduce((s, it) => s + (it.total || 0), 0) || o.orderTotal;
  let refunded = 0;
  if (o.items?.length) {
    o.items.forEach(it => {
      const net = (it.total || 0) - (it.couponDiscountLine || 0);
      if (it.itemStatus === 'returned') refunded += net;
      else if (it.itemStatus === 'cancelled' && (o.paymentMethod !== 'cod' || o.paymentStatus === 'refunded')) refunded += net;
    });
    const allInactive = o.items.every(it => it.itemStatus === 'cancelled' || it.itemStatus === 'returned');
    if (allInactive && o.paymentStatus === 'refunded') refunded = total + (o.deliveryCharge || 0) - (o.discount || 0);
  }
  const orig = total - (o.discount || 0) + (o.deliveryCharge || 0);
  const allFlag = o.items?.length ? o.items.every(it => it.itemStatus === 'cancelled' || it.itemStatus === 'returned') : false;
  return allFlag ? 0 : Math.max(0, orig - refunded);
};


async function buildReportData(query) {
  const { start, end, prevStart, prevEnd, groupBy } = getDateRange(query);

  const orderSelectFields = "orderId createdAt deliveredAt updatedAt userId orderTotal discount deliveryCharge finalAmount paymentMethod paymentStatus orderStatus couponCode isCouponApplied items";

  // 1. Online paid orders — money received when payment confirmed
  const onlineOrders = await Order.find({
    createdAt: { $gte: start, $lte: end },
    paymentMethod: { $in: ['razorpay', 'wallet'] },
    paymentStatus: 'paid',
  }).populate('userId', 'name email').select(orderSelectFields).lean();

  // 2. COD orders — money received ONLY when delivered
  const codOrders = await Order.find({
    deliveredAt: { $gte: start, $lte: end },
    paymentMethod: 'cod',
    orderStatus: 'delivered',
  }).populate('userId', 'name email').select(orderSelectFields).lean();

  // 3. Wallet refund credits (cancellation & return refunds)
  const refundTxs = await WalletTransaction.find({
    createdAt: { $gte: start, $lte: end },
    type: 'credit',
    source: { $in: ['order_cancel', 'order_return'] },
    status: 'success',
  }).populate('userId', 'name email').populate('orderId', 'orderId').lean();

  // 4. Referral bonus wallet credits
  const referralTxs = await WalletTransaction.find({
    createdAt: { $gte: start, $lte: end },
    type: 'credit',
    source: 'referral',
    status: 'success',
  }).populate('userId', 'name email').lean();

  // ── Previous period for deltas ──────────────────────────────────────────
  const prevOnlineOrders = await Order.find({
    createdAt: { $gte: prevStart, $lte: prevEnd },
    paymentMethod: { $in: ['razorpay', 'wallet'] },
    paymentStatus: 'paid',
  }).select(orderSelectFields).lean();

  const prevCodOrders = await Order.find({
    deliveredAt: { $gte: prevStart, $lte: prevEnd },
    paymentMethod: 'cod',
    orderStatus: 'delivered',
  }).select(orderSelectFields).lean();

  const prevRefundTxs = await WalletTransaction.find({
    createdAt: { $gte: prevStart, $lte: prevEnd },
    type: 'credit',
    source: { $in: ['order_cancel', 'order_return'] },
    status: 'success',
  }).lean();

  // ── Current Period Totals ────────────────────────────────────────────────
  const totalRevenue = Math.round(
    onlineOrders.reduce((s, o) => s + computeFinal(o), 0) +
    codOrders.reduce((s, o) => s + computeFinal(o), 0)
  );
  const totalOrders = onlineOrders.length + codOrders.length;
  const totalRefunded = Math.round(refundTxs.reduce((s, tx) => s + (tx.amount || 0), 0));

  const totalDiscount = Math.round(
    onlineOrders.reduce((s, o) => s + (o.discount || 0), 0) +
    codOrders.reduce((s, o) => s + (o.discount || 0), 0)
  );
  const couponDiscount = Math.round(
    onlineOrders.filter(o => o.isCouponApplied).reduce((s, o) => s + (o.discount || 0), 0) +
    codOrders.filter(o => o.isCouponApplied).reduce((s, o) => s + (o.discount || 0), 0)
  );

  // ── Previous Period Totals ───────────────────────────────────────────────
  const prevTotalRevenue = Math.round(
    prevOnlineOrders.reduce((s, o) => s + computeFinal(o), 0) +
    prevCodOrders.reduce((s, o) => s + computeFinal(o), 0)
  );
  const prevTotalOrders = prevOnlineOrders.length + prevCodOrders.length;
  const prevTotalRefunded = Math.round(prevRefundTxs.reduce((s, tx) => s + (tx.amount || 0), 0));
  const prevTotalDiscount = Math.round(
    prevOnlineOrders.reduce((s, o) => s + (o.discount || 0), 0) +
    prevCodOrders.reduce((s, o) => s + (o.discount || 0), 0)
  );

  const pctDelta = (curVal, prevVal) => {
    if (!prevVal) return curVal ? 100 : 0;
    return Number((((curVal - prevVal) / prevVal) * 100).toFixed(1));
  };

  const revenueDelta = pctDelta(totalRevenue, prevTotalRevenue);
  const ordersDelta = pctDelta(totalOrders, prevTotalOrders);
  const refundDelta = pctDelta(totalRefunded, prevTotalRefunded);
  const discountDelta = pctDelta(totalDiscount, prevTotalDiscount);

  // ── Chart series ────────────────────────────────────────────────────────
  const revenueMap = {};
  const ordersMap = {};

  onlineOrders.forEach(o => {
    const k = new Date(o.createdAt).toISOString().slice(0, groupBy === 'month' ? 7 : 10);
    revenueMap[k] = (revenueMap[k] || 0) + Math.round(computeFinal(o));
    ordersMap[k] = (ordersMap[k] || 0) + 1;
  });

  codOrders.forEach(o => {
    const k = new Date(o.deliveredAt || o.createdAt).toISOString().slice(0, groupBy === 'month' ? 7 : 10);
    revenueMap[k] = (revenueMap[k] || 0) + Math.round(computeFinal(o));
    ordersMap[k] = (ordersMap[k] || 0) + 1;
  });

  const chartLabels = Array.from(new Set([...Object.keys(revenueMap), ...Object.keys(ordersMap)])).sort();
  const revenueSeries = chartLabels.map(k => revenueMap[k] || 0);
  const ordersSeries = chartLabels.map(k => ordersMap[k] || 0);

  // ── Build unified transaction rows ────────────────────────────────────────
  const transactionRows = [];

  onlineOrders.forEach(o => {
    const amt = computeFinal(o);
    transactionRows.push({
      txType: 'order',
      orderId: o.orderId,
      date: o.createdAt,
      customer: o.userId?.name || o.userId?.email || '—',
      itemsCount: o.items?.reduce((s, it) => s + it.qty, 0) || 0,
      orderTotal: o.items?.reduce((s, it) => s + (it.total || 0), 0) || o.orderTotal,
      discount: o.discount || 0,
      coupon: o.isCouponApplied ? (o.couponCode || 'Applied') : '—',
      deliveryCharge: o.deliveryCharge || 0,
      finalAmount: Math.round(amt),
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      orderStatus: o.orderStatus,
    });
  });

  codOrders.forEach(o => {
    const amt = computeFinal(o);
    transactionRows.push({
      txType: 'order',
      orderId: o.orderId,
      date: o.deliveredAt || o.updatedAt || o.createdAt,
      customer: o.userId?.name || o.userId?.email || '—',
      itemsCount: o.items?.reduce((s, it) => s + it.qty, 0) || 0,
      orderTotal: o.items?.reduce((s, it) => s + (it.total || 0), 0) || o.orderTotal,
      discount: o.discount || 0,
      coupon: o.isCouponApplied ? (o.couponCode || 'Applied') : '—',
      deliveryCharge: o.deliveryCharge || 0,
      finalAmount: Math.round(amt),
      paymentMethod: 'cod',
      paymentStatus: 'paid',
      orderStatus: 'delivered',
    });
  });

  refundTxs.forEach(tx => {
    transactionRows.push({
      txType: 'refund',
      orderId: tx.orderId?.orderId || '—',
      date: tx.createdAt,
      customer: tx.userId?.name || tx.userId?.email || '—',
      itemsCount: '—',
      orderTotal: 0,
      discount: 0,
      coupon: '—',
      deliveryCharge: 0,
      finalAmount: Math.round(tx.amount),
      paymentMethod: 'wallet',
      paymentStatus: 'refunded',
      orderStatus: tx.source === 'order_cancel' ? 'cancelled' : 'returned',
      refundLabel: tx.source === 'order_cancel' ? 'Cancellation Refund' : 'Return Refund',
    });
  });

  referralTxs.forEach(tx => {
    transactionRows.push({
      txType: 'referral',
      orderId: '—',
      date: tx.createdAt,
      customer: tx.userId?.name || tx.userId?.email || '—',
      itemsCount: '—',
      orderTotal: 0,
      discount: 0,
      coupon: '—',
      deliveryCharge: 0,
      finalAmount: Math.round(tx.amount),
      paymentMethod: 'wallet',
      paymentStatus: 'paid',
      orderStatus: 'referral',
      refundLabel: 'Referral Bonus',
    });
  });

  // Sort newest first
  transactionRows.sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    range: { start, end },
    stats: {
      totalRevenue,
      revenueDelta,
      totalOrders,
      ordersDelta,
      totalRefunded,
      refundDelta,
      totalDiscount,
      discountDelta,
      couponDiscount,
    },
    chartLabels,
    revenueSeries,
    ordersSeries,
    transactionRows,
  };
}


export const getSalesReportPage = async (req, res, next) => {
  try {
    const data = await buildReportData(req.query);

    const allTransactions = data.transactionRows;
    const totalTransactions = allTransactions.length;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const totalPages = Math.ceil(totalTransactions / limit) || 1;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const transactions = allTransactions.slice(startIndex, endIndex);

    res.render("admin/sales", {
      totalRevenue: data.stats.totalRevenue,
      revenueDelta: data.stats.revenueDelta,
      totalOrders: data.stats.totalOrders,
      ordersDelta: data.stats.ordersDelta,
      totalRefunded: data.stats.totalRefunded,
      refundDelta: data.stats.refundDelta,
      totalDiscount: data.stats.totalDiscount,
      discountDelta: data.stats.discountDelta,
      couponDiscount: data.stats.couponDiscount,
      chartLabels: data.chartLabels,
      revenueSeries: data.revenueSeries,
      ordersSeries: data.ordersSeries,
      transactions,
      currentRange: req.query.range || "30d",
      startDate: req.query.startDate || "",
      endDate: req.query.endDate || "",
      title: "Sales Report",
      currentPage: page,
      totalPages,
    });
  } catch (err) {
    next(err);
  }
};


export const exportSalesReportExcel = async (req, res, next) => {
  try {
    const data = await buildReportData(req.query);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Elanora Admin";
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.columns = [
      { header: "Metric", key: "metric", width: 30 },
      { header: "Value", key: "value", width: 20 },
    ];
    summarySheet.addRows([
      { metric: "Report Period", value: `${data.range.start.toDateString()} - ${data.range.end.toDateString()}` },
      { metric: "Total Revenue (₹)", value: data.stats.totalRevenue },
      { metric: "Total Orders", value: data.stats.totalOrders },
      { metric: "Total Refunded Amount (₹)", value: data.stats.totalRefunded },
      { metric: "Total Discount Given (₹)", value: data.stats.totalDiscount },
      { metric: "Coupon Deductions (₹)", value: data.stats.couponDiscount },
    ]);
    summarySheet.getRow(1).font = { bold: true };

    const txSheet = workbook.addWorksheet("Transactions");
    txSheet.columns = [
      { header: "Order ID", key: "orderId", width: 18 },
      { header: "Date", key: "date", width: 20 },
      { header: "Customer", key: "customer", width: 24 },
      { header: "Items", key: "itemsCount", width: 8 },
      { header: "Order Total (₹)", key: "orderTotal", width: 15 },
      { header: "Discount (₹)", key: "discount", width: 13 },
      { header: "Coupon", key: "coupon", width: 14 },
      { header: "Delivery (₹)", key: "deliveryCharge", width: 12 },
      { header: "Final Amount (₹)", key: "finalAmount", width: 15 },
      { header: "Payment Method", key: "paymentMethod", width: 15 },
      { header: "Payment Status", key: "paymentStatus", width: 14 },
      { header: "Order Status", key: "orderStatus", width: 16 },
    ];
    txSheet.getRow(1).font = { bold: true };
    data.transactionRows.forEach((row) => {
      txSheet.addRow({ ...row, date: new Date(row.date).toLocaleString("en-IN") });
    });
    txSheet.autoFilter = { from: "A1", to: "L1" };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sales-report-${Date.now()}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};


export const exportSalesReportPDF = async (req, res, next) => {
  try {
    const data = await buildReportData(req.query);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="sales-report-${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    // ── Title ─────────────────────────────────────────────────────────────────
    doc.fontSize(20).fillColor("#1a1a18").font("Helvetica-Bold")
      .text("Elanora – Sales Report", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#666666").font("Helvetica")
      .text(
        `${data.range.start.toDateString()}  –  ${data.range.end.toDateString()}`,
        { align: "center" }
      );
    doc.moveDown(1.2);

    // ── Summary ───────────────────────────────────────────────────────────────
    doc.fontSize(12).fillColor("#1a1a18").font("Helvetica-Bold").text("Summary");
    doc.moveDown(0.3);

    const fmtCurr = (n) => `Rs. ${Number(n || 0).toLocaleString("en-IN")}`;

    const summaryRows = [
      ["Total Revenue", fmtCurr(data.stats.totalRevenue)],
      ["Total Orders", String(data.stats.totalOrders)],
      ["Total Refunded Amount", fmtCurr(data.stats.totalRefunded)],
      ["Total Discount Given", fmtCurr(data.stats.totalDiscount)],
      ["Coupon Deductions", fmtCurr(data.stats.couponDiscount)],
    ];

    const SUM_LABEL_X = 40;
    const SUM_VALUE_X = 230;
    doc.fontSize(10).font("Helvetica");

    summaryRows.forEach(([label, value], idx) => {
      const rowY = doc.y;
      // Alternating stripe
      if (idx % 2 === 0) {
        doc.save()
          .rect(SUM_LABEL_X - 4, rowY - 2, 519 - SUM_LABEL_X, 18)
          .fill("#f5f4f0")
          .restore();
      }
      doc.fillColor("#555555").font("Helvetica").text(label, SUM_LABEL_X, rowY + 2, { lineBreak: false });
      doc.fillColor("#1a1a18").font("Helvetica-Bold").text(value, SUM_VALUE_X, rowY + 2, { lineBreak: false });
      doc.y = rowY + 18;
    });

    doc.moveDown(1.2);

    // ── Transactions Table ────────────────────────────────────────────────────
    doc.fontSize(12).fillColor("#1a1a18").font("Helvetica-Bold").text("Transactions");
    doc.moveDown(0.5);

    // A4 usable width = 515 (595 − 40 left − 40 right)
    const PAGE_LEFT = 40;
    const PAGE_WIDTH = 515;
    const PAGE_BREAK = 760;
    const ROW_H = 16;
    const HEADER_H = 18;

    const cols = [
      { label: "Order ID", width: 82 },
      { label: "Date", width: 70 },
      { label: "Customer", width: 97 },
      { label: "Total", width: 62 },
      { label: "Discount", width: 58 },
      { label: "Final", width: 60 },
      { label: "Status", width: 86 },
    ];

    // Assign absolute X start per column
    let xCursor = PAGE_LEFT;
    cols.forEach(c => { c.x = xCursor; xCursor += c.width; });

    const drawTableHeader = () => {
      const hy = doc.y;
      doc.save().rect(PAGE_LEFT, hy, PAGE_WIDTH, HEADER_H).fill("#1a1a18").restore();
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#ffffff");
      cols.forEach(c => {
        doc.text(c.label, c.x + 3, hy + 5, { width: c.width - 6, lineBreak: false });
      });
      doc.y = hy + HEADER_H + 1;
    };

    drawTableHeader();
    doc.font("Helvetica").fontSize(7.5).fillColor("#1a1a18");

    data.transactionRows.slice(0, 200).forEach((row, idx) => {
      // Page break guard
      if (doc.y + ROW_H > PAGE_BREAK) {
        doc.addPage();
        doc.font("Helvetica").fontSize(7.5);
        drawTableHeader();
        doc.font("Helvetica").fontSize(7.5).fillColor("#1a1a18");
      }

      const rowY = doc.y;

      // Alternating stripe
      if (idx % 2 === 0) {
        doc.save().rect(PAGE_LEFT, rowY, PAGE_WIDTH, ROW_H).fill("#f5f4f0").restore();
      }

      const cells = [
        row.orderId || "—",
        new Date(row.date).toLocaleDateString("en-IN"),
        row.customer || "—",
        fmtCurr(row.orderTotal),
        fmtCurr(row.discount),
        fmtCurr(row.finalAmount),
        row.orderStatus || "—",
      ];

      doc.fillColor("#1a1a18");
      cols.forEach((c, i) => {
        doc.text(cells[i], c.x + 3, rowY + 3, { width: c.width - 6, lineBreak: false });
      });

      doc.y = rowY + ROW_H;
    });

    doc.end();
  } catch (err) {
    next(err);
  }
};