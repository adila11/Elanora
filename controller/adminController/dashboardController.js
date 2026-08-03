import Order from "../../model/orderSchema.js";
import Product from "../../model/productSchema.js";
import { User } from "../../model/userSchema.js";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function calcPercentChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export const loadDashboard = async (req, res) => {
  try {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const revenueMatch = { paymentStatus: "paid" };

    const [
      totalOrders, ordersThisMonth, ordersLastMonth,
      revenueAgg, revenueThisMonthAgg, revenueLastMonthAgg,
      totalCustomers, customersThisMonth, customersLastMonth,
      totalProducts, productsThisMonth, productsLastMonth,
      recentOrders, topProducts, topCategories, topVariants
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
      Order.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),

      Order.aggregate([{ $match: revenueMatch }, { $group: { _id: null, total: { $sum: "$finalAmount" } } }]),
      Order.aggregate([{ $match: { ...revenueMatch, createdAt: { $gte: startOfThisMonth } } }, { $group: { _id: null, total: { $sum: "$finalAmount" } } }]),
      Order.aggregate([{ $match: { ...revenueMatch, createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } }, { $group: { _id: null, total: { $sum: "$finalAmount" } } }]),

      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
      User.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),

      Product.countDocuments({ isListed: true }),
      Product.countDocuments({ isListed: true, createdAt: { $gte: startOfThisMonth } }),
      Product.countDocuments({ isListed: true, createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),

      Order.find().populate("userId", "fullName").sort({ createdAt: -1 }).limit(5).lean(),

      Order.aggregate([
        { $unwind: "$items" },
        { $match: { "items.itemStatus": { $nin: ["cancelled", "returned"] } } },
        { $group: { _id: "$items.productId", productName: { $first: "$items.productName" }, productImage: { $first: "$items.productImage" }, totalQty: { $sum: "$items.qty" }, totalRevenue: { $sum: "$items.total" } } },
        { $sort: { totalQty: -1 } },
        { $limit: 10 }
      ]),

      Order.aggregate([
        { $unwind: "$items" },
        { $match: { "items.itemStatus": { $nin: ["cancelled", "returned"] } } },
        { $lookup: { from: "products", localField: "items.productId", foreignField: "_id", as: "product" } },
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: false } },
        { $lookup: { from: "categories", localField: "product.category", foreignField: "_id", as: "category" } },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: false } },
        { $group: { _id: "$category._id", categoryName: { $first: "$category.name" }, totalQty: { $sum: "$items.qty" }, totalRevenue: { $sum: "$items.total" } } },
        { $sort: { totalQty: -1 } },
        { $limit: 10 }
      ]),

      Order.aggregate([
        { $unwind: "$items" },
        { $match: { "items.itemStatus": { $nin: ["cancelled", "returned"] } } },
        {
          $group: {
            _id: {
              productId: "$items.productId",
              variantName: "$items.variantName"
            },
            productName: { $first: "$items.productName" },
            variantName: { $first: "$items.variantName" },
            totalQty: { $sum: "$items.qty" },
            totalRevenue: { $sum: "$items.total" }
          }
        },
        { $sort: { totalQty: -1 } },
        { $limit: 5 }
      ])
    ]);

    const totalRevenue = revenueAgg[0]?.total || 0;
    const revenueThisMonth = revenueThisMonthAgg[0]?.total || 0;
    const revenueLastMonth = revenueLastMonthAgg[0]?.total || 0;

    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthlySales = await Order.aggregate([
      { $match: { ...revenueMatch, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, total: { $sum: "$finalAmount" } } }
    ]);

    const chartLabels = [];
    const chartData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const match = monthlySales.find(m => m._id.year === d.getFullYear() && m._id.month === d.getMonth() + 1);
      chartLabels.push(MONTH_NAMES[d.getMonth()]);
      chartData.push(match ? match.total : 0);
    }

    res.render("admin/dashboard", {
      title: "Dashboard",
      stats: {
        totalOrders, ordersChange: calcPercentChange(ordersThisMonth, ordersLastMonth),
        totalRevenue, revenueChange: calcPercentChange(revenueThisMonth, revenueLastMonth),
        totalCustomers, customersChange: calcPercentChange(customersThisMonth, customersLastMonth),
        totalProducts, productsChange: calcPercentChange(productsThisMonth, productsLastMonth)
      },
      chartLabels, chartData, recentOrders, topProducts, topCategories, topVariants,
      currentDate: now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    });

  } catch (err) {
    res.status(500).send("Dashboard temporarily unavailable. Please try again.");
  }
};

export const getDashboardChartData = async (req, res) => {
  try {
    const period = req.query.period || "6m";
    const now = new Date();
    const revenueMatch = { paymentStatus: "paid" };
    let labels = [], data = [];

    if (period === "7d") {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      const dailySales = await Order.aggregate([
        { $match: { ...revenueMatch, createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" }, day: { $dayOfMonth: "$createdAt" } }, total: { $sum: "$finalAmount" } } }
      ]);
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const match = dailySales.find(s => s._id.year === d.getFullYear() && s._id.month === d.getMonth() + 1 && s._id.day === d.getDate());
        labels.push(`${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`);
        data.push(match ? match.total : 0);
      }

    } else if (period === "6m") {
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const monthlySales = await Order.aggregate([
        { $match: { ...revenueMatch, createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, total: { $sum: "$finalAmount" } } }
      ]);
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const match = monthlySales.find(m => m._id.year === d.getFullYear() && m._id.month === d.getMonth() + 1);
        labels.push(MONTH_NAMES[d.getMonth()]);
        data.push(match ? match.total : 0);
      }

    } else if (period === "1y") {
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const monthlySales = await Order.aggregate([
        { $match: { ...revenueMatch, createdAt: { $gte: twelveMonthsAgo } } },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, total: { $sum: "$finalAmount" } } }
      ]);
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const match = monthlySales.find(m => m._id.year === d.getFullYear() && m._id.month === d.getMonth() + 1);
        labels.push(`${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`);
        data.push(match ? match.total : 0);
      }

    } else if (period === "all") {
      const yearlySales = await Order.aggregate([
        { $match: revenueMatch },
        { $group: { _id: { year: { $year: "$createdAt" } }, total: { $sum: "$finalAmount" } } },
        { $sort: { "_id.year": 1 } }
      ]);
      labels = yearlySales.map(y => String(y._id.year));
      data = yearlySales.map(y => y.total);
    }

    res.json({ success: true, labels, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch chart data" });
  }
};
