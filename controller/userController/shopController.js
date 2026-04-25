import Products from "../../model/productSchema.js";
import Category from "../../model/categoriesSchema.js";

export const loadShop = async (req, res) => {
    try {
        const { search = '', category = 'all', sort = 'newest' } = req.query;

        let query = { isListed: true };
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }
        if (category !== 'all') {
            query.category = category;
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'price-low') sortOption = { discountPrice: 1 };
        else if (sort === 'price-high') sortOption = { discountPrice: -1 };
        else if (sort === 'name-asc') sortOption = { name: 1 };
        else if (sort === 'name-desc') sortOption = { name: -1 };

        const products = await Products.find(query)
            .populate('category')
            .sort(sortOption);

        const categories = await Category.find({ isActive: true });

        res.render("user/shop", {
            products,
            categories,
            search,
            selectedCategory: category,
            selectedSort: sort,
            title: "Shop Collection"
        });
    } catch (error) {
        console.error("LOAD SHOP ERROR:", error);
        res.status(500).send("Server error");
    }
};

export const loadProductDetail = async (req, res) => {
    try {
        const product = await Products.findById(req.params.id).populate('category');
        if (!product || !product.isListed) {
            return res.status(404).render('user/404', { title: 'Product Not Found' });
        }

        const relatedProducts = await Products.find({
            category: product.category?._id,
            _id: { $ne: product._id },
            isListed: true
        }).limit(4);

        res.render("user/productDetail", {
            product,
            relatedProducts,
            title: product.name
        });
    } catch (error) {
        console.error("LOAD PRODUCT DETAIL ERROR:", error);
        res.status(500).send("Server error");
    }
};