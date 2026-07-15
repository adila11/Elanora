
export const loadSales = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin");
        }

        res.render("admin/sales", {
            title: "Sales Report",

            totalRevenue: 48229.5,
            revenueDelta: 12.4,

            totalOrders: 262,
            ordersDelta: 8.7,

            avgOrderValue: 184.08,
            aovDelta: 2.5,

            conversionRate: 4.8,
            conversionDelta: 0.6,

            chartLabels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
            revenueSeries: [32000, 37500, 29000, 43000, 41500, 48229.5],
            ordersSeries: [95, 172, 140, 218, 168, 262]
        });

    } catch (error) {
        console.log(error);
        res.status(500).send("Server Error");
    }
};