import express from "express"
import { loadLogin, login, logout } from "../controller/adminController/loginController.js"
import { loadDashboard } from "../controller/adminController/dashboardController.js"
import { blockUser, loadUserManagement } from "../controller/adminController/customersController.js"
import { loadProduct, loadAddProduct, addProduct, loadEditProduct, editProduct, toggleProductStatus, deleteProduct } from "../controller/adminController/productController.js"
import { loadCategories, addCategory, editCategory, toggleCategory, deleteCategory } from "../controller/adminController/categoriesController.js"
import { getOrdersPage, updateOrderStatus, getOrderDetail } from "../controller/adminController/orderController.js"
import { approveReturn, getReturnsPage, rejectReturn } from "../controller/adminController/returnController.js"
import { createCoupon, deleteCoupon, loadCoupons, updateCoupon } from "../controller/adminController/couponController.js"

import upload from "../config/multerCloudinary.js"
import { getSalesReportPage, exportSalesReportExcel, exportSalesReportPDF } from "../controller/adminController/salesController.js"
const router=express.Router()

router.get("/",loadLogin)
router.post("/",login)

router.get("/dashboard",loadDashboard)

router.get("/products",loadProduct)
router.get("/products/add",loadAddProduct)
router.post("/products/add",upload.any(),addProduct)
router.get("/products/edit/:id", loadEditProduct)
router.post("/products/edit/:id", upload.any(), editProduct)
router.patch("/products/:id/toggle", toggleProductStatus)
router.delete("/products/:id", deleteProduct)

router.get("/customers",loadUserManagement)
router.post("/customers/:id/toggle-block",blockUser)

router.get("/categories", loadCategories)
router.post("/categories/add", addCategory)
router.put("/categories/edit/:id", editCategory)
router.patch("/categories/:id/toggle", toggleCategory)
router.delete("/categories/:id", deleteCategory)

router.get("/orders", getOrdersPage);
router.get("/orders/:orderId", getOrderDetail);
router.patch("/orders/:orderId/status",updateOrderStatus);

router.get("/returns",getReturnsPage);
router.patch("/returns/:id/approve",approveReturn);
router.patch("/returns/:id/reject",rejectReturn);

router.get("/coupons",loadCoupons);
router.post("/coupons", createCoupon);
router.put("/coupons/:id", updateCoupon);
router.delete("/coupons/:id", deleteCoupon);

router.get("/sales-reports", getSalesReportPage);
router.get("/sales", getSalesReportPage);
router.get("/sales-reports/export", exportSalesReportExcel); 
router.get("/sales-reports/export/pdf", exportSalesReportPDF);
 
router.get('/logout',logout) ;

router.use((req, res) => {
  res.status(404).render('admin/404', { title: 'Page Not Found' });
});

export default router
