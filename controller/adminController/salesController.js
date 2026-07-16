import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import Order from "../../model/orderSchema.js";       
import Return from "../../model/returnSchema.js";     

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
      case "7d":
        start.setDate(start.getDate() - 6);
        break;
      case "90d":
        start.setDate(start.getDate() - 89);
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


async function buildReportData(query) {
  const { start, end, prevStart, prevEnd, groupBy } = getDateRange(query);

  const baseMatch = {
    createdAt: { $gte: start, $lte: end },
    orderStatus: { $nin: REVENUE_EXCLUDED_STATUSES },
  };
  const prevMatch = {
    createdAt: { $gte: prevStart, $lte: prevEnd },
    orderStatus: { $nin: REVENUE_EXCLUDED_STATUSES },
  };

  const [currentSummary] = await Order.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$finalAmount" },
        totalOrders: { $sum: 1 },
        totalDiscount: { $sum: { $ifNull: ["$discount", 0] } },
        couponDiscount: {
          $sum: {
            $cond: [{ $eq: ["$isCouponApplied", true] }, { $ifNull: ["$discount", 0] }, 0],
          },
        },
      },
    },
  ]);

  const [prevSummary] = await Order.aggregate([
    { $match: prevMatch },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$finalAmount" },
        totalOrders: { $sum: 1 },
        totalDiscount: { $sum: { $ifNull: ["$discount", 0] } },
      },
    },
  ]);

  const cur = currentSummary || { totalRevenue: 0, totalOrders: 0, totalDiscount: 0, couponDiscount: 0 };
  const prev = prevSummary || { totalRevenue: 0, totalOrders: 0, totalDiscount: 0 };

  const pctDelta = (curVal, prevVal) => {
    if (!prevVal) return curVal ? 100 : 0;
    return Number((((curVal - prevVal) / prevVal) * 100).toFixed(1));
  };

  const totalRevenue = Math.round(cur.totalRevenue || 0);
  const totalOrders = cur.totalOrders || 0;
  const totalDiscount = Math.round(cur.totalDiscount || 0);
  const couponDiscount = Math.round(cur.couponDiscount || 0);
  const avgOrderValue = totalOrders ? Math.round(totalRevenue / totalOrders) : 0;

  const revenueDelta = pctDelta(totalRevenue, prev.totalRevenue);
  const ordersDelta = pctDelta(totalOrders, prev.totalOrders);
  const discountDelta = pctDelta(totalDiscount, prev.totalDiscount);
  const aovDelta = pctDelta(
    avgOrderValue,
    prev.totalOrders ? Math.round(prev.totalRevenue / prev.totalOrders) : 0
  );

  const [returnsSummary] = await Return.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end }, status: "approved" } },
    { $group: { _id: null, totalReturns: { $sum: 1 }, totalRefunded: { $sum: "$refundAmount" } } },
  ]);

  const dateFormat = groupBy === "month" ? "%Y-%m" : "%Y-%m-%d";

  const series = await Order.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: "$createdAt" } },
        revenue: { $sum: "$finalAmount" },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const chartLabels = series.map((s) => s._id);
  const revenueSeries = series.map((s) => Math.round(s.revenue));
  const ordersSeries = series.map((s) => s.orders);

  const transactions = await Order.find(baseMatch)
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .limit(500) 
    .select(
      "orderId createdAt userId orderTotal discount deliveryCharge finalAmount paymentMethod paymentStatus orderStatus couponCode isCouponApplied items"
    )
    .lean();

  const transactionRows = transactions.map((o) => ({
    orderId: o.orderId,
    date: o.createdAt,
    customer: o.userId?.name || o.userId?.email || "—",
    itemsCount: o.items?.reduce((sum, it) => sum + it.qty, 0) || 0,
    orderTotal: o.orderTotal,
    discount: o.discount || 0,
    coupon: o.isCouponApplied ? o.couponCode || "Applied" : "—",
    deliveryCharge: o.deliveryCharge || 0,
    finalAmount: o.finalAmount,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    orderStatus: o.orderStatus,
  }));

  return {
    range: { start, end },
    stats: {
      totalRevenue,
      revenueDelta,
      totalOrders,
      ordersDelta,
      avgOrderValue,
      aovDelta,
      totalDiscount,
      discountDelta,
      couponDiscount,
      totalReturns: returnsSummary?.totalReturns || 0,
      totalRefunded: Math.round(returnsSummary?.totalRefunded || 0),
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
      avgOrderValue: data.stats.avgOrderValue,
      aovDelta: data.stats.aovDelta,
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
      { metric: "Average Order Value (₹)", value: data.stats.avgOrderValue },
      { metric: "Total Discount Given (₹)", value: data.stats.totalDiscount },
      { metric: "Coupon Deductions (₹)", value: data.stats.couponDiscount },
      { metric: "Approved Returns", value: data.stats.totalReturns },
      { metric: "Refunded Amount (₹)", value: data.stats.totalRefunded },
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

    doc.fontSize(18).text("Sales Report", { align: "center" });
    doc
      .fontSize(10)
      .fillColor("#666")
      .text(`${data.range.start.toDateString()} - ${data.range.end.toDateString()}`, { align: "center" });
    doc.moveDown(1.5);

    doc.fillColor("#000").fontSize(12).text("Summary", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    [
      ["Total Revenue", `Rs. ${data.stats.totalRevenue}`],
      ["Total Orders", data.stats.totalOrders],
      ["Average Order Value", `Rs. ${data.stats.avgOrderValue}`],
      ["Total Discount Given", `Rs. ${data.stats.totalDiscount}`],
      ["Coupon Deductions", `Rs. ${data.stats.couponDiscount}`],
      ["Approved Returns", data.stats.totalReturns],
      ["Refunded Amount", `Rs. ${data.stats.totalRefunded}`],
    ].forEach(([label, value]) => {
      doc.text(`${label}: ${value}`);
    });

    doc.moveDown(1);
    doc.fontSize(12).text("Transactions", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(8);

    const colX = [40, 110, 200, 280, 340, 400, 460];
    const headers = ["Order ID", "Date", "Customer", "Total", "Discount", "Final", "Status"];
    headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { continued: i < headers.length - 1 }));
    doc.moveDown(0.3);

    data.transactionRows.slice(0, 200).forEach((row) => {
      const y = doc.y;
      doc.text(row.orderId, colX[0], y, { width: 65 });
      doc.text(new Date(row.date).toLocaleDateString("en-IN"), colX[1], y, { width: 85 });
      doc.text(row.customer, colX[2], y, { width: 75 });
      doc.text(String(row.orderTotal), colX[3], y, { width: 55 });
      doc.text(String(row.discount), colX[4], y, { width: 55 });
      doc.text(String(row.finalAmount), colX[5], y, { width: 55 });
      doc.text(row.orderStatus, colX[6], y, { width: 90 });
      doc.moveDown(0.6);
      if (doc.y > 760) doc.addPage();
    });

    doc.end();
  } catch (err) {
    next(err);
  }
};