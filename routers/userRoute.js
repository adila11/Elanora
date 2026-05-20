import express from 'express'
import loadHome from '../controller/userController/homeController.js'
import { loadLogin,login,loadSignup,signup,loadSignupOTPVerification,SignupOTPVerification,loadforgotpassword, forgotpassword, loadforgotpassOTPVerification,forgotpassOTPVerification, loadnewpassword, newpassword, logout, resendOtp } from '../controller/userController/authController.js'
import { editEmail, editProfile, loadPagenotFound, loadProfile, verifyEmail, } from '../controller/userController/profileController.js'
import { addAddress, deleteAddress, editAddress, loadAddAddress, loadAddress, loadEditAddress, setDefault } from '../controller/userController/addressController.js'
import { isLoggedIn , isBlocked } from "../middleware/authMiddleware.js";
import upload from '../config/multerCloudinary.js'
import { loadresetpassword,resetpassword } from '../controller/userController/resetPasswordController.js'
import passport from 'passport'
import { loadShop , loadProductDetail } from '../controller/userController/shopController.js'
import { addToCart, loadCart, updateCartItem, removeCartItem } from '../controller/userController/cartController.js'
import { loadWishlist, addToWishlist, removeFromWishlist } from '../controller/userController/wishlistController.js'
import { loadCheckoutAddress,loadCheckoutPayment,loadCheckoutReview,placeOrder} from "../controller/userController/checkoutController.js";
const router=express.Router()


router.get("/",loadHome)

router.get("/login",loadLogin)
router.post("/login",login)

router.get("/auth/google",passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login", failureFlash: true }),
  (req, res) => {
    if (req.user && req.user.isBlocked) {
      req.logout((err) => {
        req.flash('error', "Your account has been blocked by the admin");
        res.redirect("/login");
      });
      return;
    }

    req.session.user = req.user.email;
    req.session.save(() => {
      res.redirect("/");
    });
  }
);

router.get("/forgotpassword",loadforgotpassword)
router.post("/forgotpassword",forgotpassword)

router.get("/forgotpassword-otpverify",loadforgotpassOTPVerification)
router.post("/forgotpassword-otpverify",forgotpassOTPVerification)

router.get("/newpassword",loadnewpassword) ;
router.post("/newpassword",newpassword) ;

router.get("/signup",loadSignup)
router.post("/signup",signup)

router.get("/signup-verification",loadSignupOTPVerification)
router.post("/signup-verification",SignupOTPVerification)

router.get("/profile",isLoggedIn,isBlocked,loadProfile)
router.post("/profile",isLoggedIn,isBlocked,upload.single("profileIcon"),editProfile)

router.post("/profile/email/send-otp",isLoggedIn,isBlocked,editEmail)
router.post("/profile/email/verify-otp",isLoggedIn,isBlocked,verifyEmail)

router.get("/orders",isLoggedIn,isBlocked)

router.get("/addresses",isLoggedIn,isBlocked,loadAddress)

router.get("/addresses/add",isLoggedIn,isBlocked,loadAddAddress)
router.post("/addresses/add",isLoggedIn,isBlocked,addAddress)

router.get("/addresses/edit/:id",isLoggedIn,isBlocked,loadEditAddress)
router.put("/addresses/edit/:id",isLoggedIn,isBlocked,editAddress)

router.patch("/addresses/:id/default",isLoggedIn,isBlocked,setDefault) ;
router.patch("/addresses/:id/delete",isLoggedIn,isBlocked,deleteAddress) ;

router.get("/wallet",isLoggedIn,isBlocked,loadPagenotFound)

router.get("/resetPassword",isLoggedIn,isBlocked,loadresetpassword)
router.post("/resetPassword",isLoggedIn,isBlocked,resetpassword)

router.get("/referral",isLoggedIn,isBlocked,loadPagenotFound)

router.get("/shop",loadShop)

router.get("/product/:id",loadProductDetail)

router.post("/add-to-cart", isLoggedIn, isBlocked, addToCart);
router.patch("/update-cart", isLoggedIn, isBlocked, updateCartItem);
router.delete("/remove-cart-item", isLoggedIn, isBlocked, removeCartItem);
router.get("/cart", isLoggedIn, isBlocked, loadCart)

router.get("/wishlist", isLoggedIn, isBlocked, loadWishlist)
router.post("/add-to-wishlist", isLoggedIn, isBlocked, addToWishlist)
router.post("/remove-from-wishlist", isLoggedIn, isBlocked, removeFromWishlist)

router.get("/checkout/address", isLoggedIn, isBlocked, loadCheckoutAddress);

router.get("/checkout/payment", isLoggedIn, isBlocked, loadCheckoutPayment);

router.get("/checkout/review", isLoggedIn, isBlocked, loadCheckoutReview);
router.post("/place-order", isLoggedIn, isBlocked, placeOrder);

// router.get("/my-orders", isLoggedIn, isBlocked, getMyOrders);
// router.get("/order/:orderId", isLoggedIn, isBlocked, getOrderDetails);

// router.patch("/order/:orderId/cancel", isLoggedIn, isBlocked, cancelOrder);

// router.patch("/order/:orderId/return", isLoggedIn, isBlocked, returnOrder);


router.post("/resend-otp", resendOtp)

router.get("/logout",logout)


router.use(loadPagenotFound);
export default router


