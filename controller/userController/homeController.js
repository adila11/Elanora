import Products from "../../model/productSchema.js";
import Category from "../../model/categoriesSchema.js";

const loadHome = async (req, res) => {
    try {
        const products = await Products.find({ isListed: true })
            .populate('category')
            .sort({ createdAt: -1 })
            .limit(6);

        const categories = await Category.find({ isActive: true });

        return res.render("user/home", { products, categories });
    } catch (error) {
        console.error("LOAD HOME ERROR:", error);
        res.status(500).send("Server error");
    }
};

export default loadHome;