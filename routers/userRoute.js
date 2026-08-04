import express from 'express'
import loadHome from '../controller/userController/homeController.js'
import { loadLogin, login, loadSignup, signup, loadSignupOTPVerification, SignupOTPVerification, loadforgotpassword, forgotpassword, loadforgotpassOTPVerification, forgotpassOTPVerification, loadnewpassword, newpassword, logout, resendOtp } from '../controller/userController/authController.js'
import { editEmail, editProfile, loadPagenotFound, loadProfile, verifyEmail, sendCurrentEmailOtp, verifyCurrentEmailOtp, sendNewEmailOtp, verifyNewEmailOtp } from '../controller/userController/profileController.js'
import { addAddress, deleteAddress, editAddress, loadAddAddress, loadAddress, loadEditAddress, setDefault } from '../controller/userController/addressController.js'
import { isLoggedIn, isBlocked } from "../middleware/authMiddleware.js";
import upload from '../config/multerCloudinary.js'
import { loadresetpassword, resetpassword } from '../controller/userController/resetPasswordController.js'
import passport from 'passport'
import { loadShop, loadProductDetail } from '../controller/userController/shopController.js'
import { addToCart, loadCart, updateCartItem, removeCartItem } from '../controller/userController/cartController.js'
import { loadWishlist, addToWishlist, removeFromWishlist } from '../controller/userController/wishlistController.js'
import { loadCheckoutAddress, loadCheckoutPayment, loadCheckoutReview, placeOrder, loadOrderSuccess, createRazorpayOrder, verifyPayment, loadOrderFailed } from "../controller/userController/checkoutController.js";
import { cancelFullOrder, cancelSingleItem, getOrderDetail, getOrders, returnItem } from '../controller/userController/orderController.js'
import { checkPincode } from "../utils/pincodeValidator.js";
import { loadAbout } from '../controller/userController/aboutController.js'
import { loadContact } from '../controller/userController/contactController.js'
import { createWalletTopupOrder, loadWallet, loadWalletTransactions, verifyWalletPayment } from '../controller/userController/walletController.js'
import { loadReferralPage } from '../controller/userController/referralController.js'
import { applyCoupon, removeCoupon } from '../controller/userController/couponController.js'
const router = express.Router()



router.get("/", loadHome)

router.get("/login", loadLogin)
router.post("/login", login)

router.get("/about", loadAbout);

router.get("/contact", loadContact);

router.get("/auth/google", (req, res, next) => {
    if (req.query.ref) {
        req.session.referredBy = req.query.ref;
    }
    next();
}, passport.authenticate("google", { scope: ["profile", "email"] }));

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

router.get("/forgotpassword", loadforgotpassword)
router.post("/forgotpassword", forgotpassword)

router.get("/forgotpassword-otpverify", loadforgotpassOTPVerification)
router.post("/forgotpassword-otpverify", forgotpassOTPVerification)

router.get("/newpassword", loadnewpassword);
router.post("/newpassword", newpassword);

router.get("/signup", loadSignup)
router.post("/signup", signup)

router.get("/signup-verification", loadSignupOTPVerification)
router.post("/signup-verification", SignupOTPVerification)

router.get("/profile", isLoggedIn, isBlocked, loadProfile)
router.post("/profile", isLoggedIn, isBlocked, upload.single("profileIcon"), editProfile)

router.post("/profile/email/send-current-otp", isLoggedIn, isBlocked, sendCurrentEmailOtp)
router.post("/profile/email/verify-current-otp", isLoggedIn, isBlocked, verifyCurrentEmailOtp)
router.post("/profile/email/send-new-otp", isLoggedIn, isBlocked, sendNewEmailOtp)
router.post("/profile/email/verify-new-otp", isLoggedIn, isBlocked, verifyNewEmailOtp)
router.post("/profile/email/send-otp", isLoggedIn, isBlocked, editEmail)
router.post("/profile/email/verify-otp", isLoggedIn, isBlocked, verifyEmail)

router.get("/addresses", isLoggedIn, isBlocked, loadAddress)
router.get("/addresses/add", isLoggedIn, isBlocked, loadAddAddress)
router.post("/addresses/add", isLoggedIn, isBlocked, addAddress)
router.get("/addresses/edit/:id", isLoggedIn, isBlocked, loadEditAddress)
router.put("/addresses/edit/:id", isLoggedIn, isBlocked, editAddress)
router.patch("/addresses/:id/default", isLoggedIn, isBlocked, setDefault);
router.patch("/addresses/:id/delete", isLoggedIn, isBlocked, deleteAddress);

router.get("/wallet", isLoggedIn, isBlocked, loadWallet)
router.get("/wallet/transactions", loadWalletTransactions);
router.post("/wallet/topup/create-order", isLoggedIn, isBlocked, createWalletTopupOrder);
router.post("/wallet/topup/verify", isLoggedIn, isBlocked, verifyWalletPayment);

router.get("/resetPassword", isLoggedIn, isBlocked, loadresetpassword)
router.post("/resetPassword", isLoggedIn, isBlocked, resetpassword)

router.get("/referral", isLoggedIn, isBlocked, loadReferralPage)

router.get("/shop", loadShop)

router.get("/product/:id", loadProductDetail)

router.post("/add-to-cart", isLoggedIn, isBlocked, addToCart);
router.patch("/update-cart", isLoggedIn, isBlocked, updateCartItem);
router.delete("/remove-cart-item", isLoggedIn, isBlocked, removeCartItem);
router.get("/cart", isLoggedIn, isBlocked, loadCart)

router.get("/wishlist", isLoggedIn, isBlocked, loadWishlist)
router.post("/add-to-wishlist", isLoggedIn, isBlocked, addToWishlist)
router.post("/remove-from-wishlist", isLoggedIn, isBlocked, removeFromWishlist)

router.get("/checkout/address", isLoggedIn, isBlocked, loadCheckoutAddress);
router.post("/checkout/payment", isLoggedIn, isBlocked, loadCheckoutPayment);
router.get("/checkout/payment", isLoggedIn, isBlocked, loadCheckoutPayment);
router.post("/checkout/review", isLoggedIn, isBlocked, loadCheckoutReview);
router.get("/checkout/review", isLoggedIn, isBlocked, (req, res) => res.redirect("/checkout/address"));
router.post("/place-order", isLoggedIn, isBlocked, placeOrder);
router.post("/apply-coupon", isLoggedIn, isBlocked, applyCoupon);
router.post("/remove-coupon", isLoggedIn, isBlocked, removeCoupon);
router.post("/create-razorpay-order", createRazorpayOrder);
router.post("/verify-razorpay-payment", verifyPayment);

router.get("/check-pincode/:pincode", isLoggedIn, isBlocked, checkPincode);

router.get("/order-success/:id", isLoggedIn, isBlocked, loadOrderSuccess);
router.get("/order-failed", isLoggedIn, isBlocked, loadOrderFailed)

router.get("/orders", isLoggedIn, isBlocked, getOrders);
router.get("/orders/:id", isLoggedIn, isBlocked, getOrderDetail);
router.post('/orders/:id/cancel', cancelFullOrder);
router.post('/cancel-item', cancelSingleItem);
router.post('/return-item', returnItem);

router.post("/resend-otp", resendOtp)

router.get("/logout", logout)

router.use(loadPagenotFound);
export default router


