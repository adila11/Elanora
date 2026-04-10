import express from "express"
import { loadLogin, login, logout } from "../controller/adminController/loginController.js"
import { loadDashboard } from "../controller/adminController/dashboardController.js"
import { blockUser, loadUserManagement } from "../controller/adminController/customersController.js"
const router=express.Router()

router.get("/",loadLogin)
router.post("/",login)

router.get("/dashboard",loadDashboard)


router.get("/customers",loadUserManagement)
router.post("/customers/:id/toggle-block",blockUser)



router.get('/logout',logout) ;

export default router
