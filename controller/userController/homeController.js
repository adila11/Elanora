import Products from "../../model/productSchema.js";
import Category from "../../model/categoriesSchema.js";
import Cart from '../../model/cartSchema.js';
import { User } from '../../model/userSchema.js';

const loadHome = async (req, res) => {
    try {

        const products = await Products.find({ isListed: true })
            .populate("category")
            .sort({ createdAt: -1 })
            .limit(6);

        const categories = await Category.find({
            isActive: true
        });

        let cartLength = 0;

        if (req.session.user) {
            const user = await User.findOne({
                email: req.session.user
            });

            if (user) {
                const cart = await Cart.findOne({
                    userId: user._id
                });

                cartLength = cart
                    ? cart.items.reduce((sum, item) => sum + item.qty, 0)
                    : 0;
            }
        }

        return res.render("user/home", {
            products,
            categories,
            cartLength
        });

    } catch (error) {
        console.error("LOAD HOME ERROR:", error);
        res.status(500).send("Server error");
    }
};

export default loadHome;