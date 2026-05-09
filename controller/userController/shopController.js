import Products from "../../model/productSchema.js";
import Category from "../../model/categoriesSchema.js";
import Wishlist from "../../model/wishlistSchema.js";
import { User } from "../../model/userSchema.js";

export const loadShop = async (req, res) => {
    try {
        const { search = '', category = 'all', sort = 'newest', page = 1, priceMin = '', priceMax = '' } = req.query;
        const ITEMS_PER_PAGE = 9;
        const currentPage = Math.max(1, parseInt(page) || 1);

        let query = { isListed: true };
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }
        if (category !== 'all') {
            query.category = category;
        }
``
        if (priceMin || priceMax) {
            query.$or = [
                {
                    discountPrice: {
                        ...(priceMin && { $gte: parseInt(priceMin) }),
                        ...(priceMax && { $lte: parseInt(priceMax) })
                    }
                },
                {
                    discountPrice: { $exists: false },
                    basePrice: {
                        ...(priceMin && { $gte: parseInt(priceMin) }),
                        ...(priceMax && { $lte: parseInt(priceMax) })
                    }
                }
            ];
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'price-low') sortOption = { discountPrice: 1 };
        else if (sort === 'price-high') sortOption = { discountPrice: -1 };
        else if (sort === 'name-asc') sortOption = { name: 1 };
        else if (sort === 'name-desc') sortOption = { name: -1 };

        // Get total count for pagination
        const totalProducts = await Products.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE);
        const skip = (currentPage - 1) * ITEMS_PER_PAGE;

        const products = await Products.find(query)
            .populate('category')
            .sort(sortOption)
            .skip(skip)
            .limit(ITEMS_PER_PAGE);

        const categories = await Category.find({ isActive: true });

        // Get user's wishlist if logged in
        let wishlistProductIds = [];
        if (req.session.user) {
            const user = await User.findOne({ email: req.session.user });
            if (user) {
                const wishlist = await Wishlist.findOne({ userId: user._id });
                if (wishlist) {
                    wishlistProductIds = wishlist.products.map(p => p.productId.toString());
                }
            }
        }

        // Helper to build query string for pagination links
        const buildQuery = (pageNum) => {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (category !== 'all') params.set('category', category);
            if (sort !== 'newest') params.set('sort', sort);
            if (priceMin) params.set('priceMin', priceMin);
            if (priceMax) params.set('priceMax', priceMax);
            params.set('page', pageNum);
            return params.toString();
        };

        res.render("user/shop", {
            products,
            categories,
            search,
            selectedCategory: category,
            selectedSort: sort,
            selectedPriceMin: priceMin,
            selectedPriceMax: priceMax,
            title: "Shop Collection",
            currentPage,
            totalPages,
            totalProducts,
            wishlistProductIds,
            buildQuery
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
            return res.redirect('/shop');
        }

        const relatedProducts = await Products.find({
            category: product.category?._id,
            _id: { $ne: product._id },
            isListed: true
        }).limit(4);

        // Check if product is in user's wishlist
        let inWishlist = false;
        if (req.session.user) {
            const user = await User.findOne({ email: req.session.user });
            if (user) {
                const wishlist = await Wishlist.findOne({ userId: user._id });
                if (wishlist) {
                    inWishlist = wishlist.products.some(
                        p => p.productId.toString() === product._id.toString()
                    );
                }
            }
        }

        res.render("user/productDetail", {
            product,
            relatedProducts,
            title: product.name,
            inWishlist
        });
    } catch (error) {
        console.error("LOAD PRODUCT DETAIL ERROR:", error);
        res.status(500).send("Server error");
    }
};