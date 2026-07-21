// Admin Auth
export const adminAuth = (req, res, next) => {
    if (req.session && req.session.admin) {
        return next();
    }

    const isAjax = req.xhr ||
        (req.headers.accept && req.headers.accept.includes("application/json")) ||
        req.headers["x-requested-with"] === "XMLHttpRequest";

    if (isAjax) {
        return res.status(401).json({ success: false, message: "Unauthorized. Admin session required." });
    }

    return res.redirect("/admin");
};
