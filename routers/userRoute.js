import express from 'express'
import loadHomepage from '../controller/userController.js'
const router=express.Router()


router.get("/", loadHomepage)

export default router