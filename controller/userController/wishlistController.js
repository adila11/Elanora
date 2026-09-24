import { STATUS_CODES } from "../../constants/statusCodes.js";
import Wishlist from "../../model/wishlistSchema.js";
import Products from "../../model/productSchema.js";
import { User } from "../../model/userSchema.js";
import Cart from "../../model/cartSchema.js";
import { getEffectivePrice } from "../../utils/offerHelper.js";
import { MESSAGES } from '../../constants/messages.js';
import Category from "../../model/categoriesSchema.js";
import { sendCurrentEmailOtp } from "./profileController.js";

export const loadWishlist = async (req, res) => {
    try {
        const userEmail = req.session.user;
        const user = await User.findOne({ email: userEmail });

        if (!user) {
            return res.redirect("/login");
        }

        const wishlist = await Wishlist.findOne({ userId: user._id })
            .populate({
                path: "products.productId",
                populate: {
                    path: "category"
                }
            });

        let wishlistItems = [];
        if (wishlist && wishlist.products.length > 0) {
            wishlistItems = wishlist.products.filter(
                item => item.productId && item.productId.isListed
            );
            wishlistItems.forEach(item => {
                const pricing = getEffectivePrice(item.productId);
                item.productId.discountPrice = pricing.price;
            });
        }

        res.render("user/wishlist", {
            wishlistItems,
            title: "My Wishlist"
        });

    } catch (error) {
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};

export const addToWishlist = async (req, res) => {
    try {
        const userEmail = req.session.user;

        if (!userEmail) {
            return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: MESSAGES.AUTH_PLEASE_LOGIN_FIRST });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: MESSAGES.AUTH_PLEASE_LOGIN_FIRST });
        }

        const { productId } = req.body;

        const product = await Products.findById(productId);
        if (!product) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.PRODUCT_NOT_FOUND_1 });
        }

        const cart = await Cart.findOne({ userId: user._id });
        if (cart) {
            const inCart = cart.items.some(item => item.productId.toString() === productId.toString());
            if (inCart) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "This product already exists in your cart." });
            }
        }

        



        let wishlist = await Wishlist.findOne({ userId: user._id });

        if (!wishlist) {
            wishlist = new Wishlist({
                userId: user._id,
                products: [{ productId }]
            });
        } else {
            const exists = wishlist.products.some(
                item => item.productId.toString() === productId
            );

            if (exists) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Product already in wishlist" });
            }

            wishlist.products.push({ productId });
        }

        await wishlist.save();
        res.status(STATUS_CODES.OK).json({ success: true, message: "Added to wishlist" });

    } catch (error) {
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
    }
};

export const removeFromWishlist = async (req, res) => {
    try {
        const userEmail = req.session.user;

        if (!userEmail) {
            return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: MESSAGES.AUTH_PLEASE_LOGIN_FIRST });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: MESSAGES.AUTH_PLEASE_LOGIN_FIRST });
        }

        const { productId } = req.body;

        const wishlist = await Wishlist.findOne({ userId: user._id });

        if (!wishlist) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "Wishlist not found" });
        }

        wishlist.products = wishlist.products.filter(
            item => item.productId.toString() !== productId
        );

        await wishlist.save();
        res.status(STATUS_CODES.OK).json({ success: true, message: "Removed from wishlist" });

    } catch (error) {
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
    }
};

