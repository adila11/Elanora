import Cart from "../model/cartSchema.js";
import Wishlist from "../model/wishlistSchema.js";
import { User } from "../model/userSchema.js";

const cartCountMiddleware = async (req, res, next) => {
    try {

        let cartCount = 0;
        let wishlistCount = 0;

        if (req.session.user) {

            const user = await User.findOne({email: req.session.user});

            if (user) {

                const cart = await Cart.findOne({userId: user._id});
                const wishlist = await Wishlist.findOne({userId:user._id}) ;

                cartCount = cart?.items?.length || 0;
                wishlistCount = wishlist?.products?.length||0 ;
            }
        }

        res.locals.cartCount = cartCount;
        res.locals.wishlistCount = wishlistCount;

        next();

    } catch (error) {
        res.locals.cartCount = 0;
        next();
    }
};

export default cartCountMiddleware;