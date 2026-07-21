import Products from "../../model/productSchema.js";
import Category from "../../model/categoriesSchema.js";
import Wishlist from "../../model/wishlistSchema.js";
import { User } from "../../model/userSchema.js";
import { getEffectivePrice } from "../../utils/offerHelper.js";

// Load Shop
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

        
        const totalProducts = await Products.find(query)
            .populate({
                path: "category",
                match: {
                    isActive: true
                }
            })
            .then(products => products.filter(p => p.category).length);
        const totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE);
        const skip = (currentPage - 1) * ITEMS_PER_PAGE;

        const products = await Products.find(query)
            .populate({
                path: "category",
                match: {
                    isActive: true
                }
            })
            .sort(sortOption)
            .skip(skip)
            .limit(ITEMS_PER_PAGE);


        const activeProducts = products.filter(
            product => product.category
        );

        activeProducts.forEach(p => {
            const pricing = getEffectivePrice(p);
            p.discountPrice = pricing.price;
        });

        const categories = await Category.find({ isActive: true });

        
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
            products: activeProducts,
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

// Load Product Detail
export const loadProductDetail = async (req, res) => {
    try {
        const product = await Products.findById(req.params.id)
            .populate({
                path: "category",
                match: {
                    isActive: true
                }
            });


        if (!product || !product.isListed || !product.category) {
            return res.redirect('/shop');
        }

        const pricing = getEffectivePrice(product);
        product.discountPrice = pricing.price;

        const relatedProducts = await Products.find({
            category: product.category?._id,
            _id: { $ne: product._id },
            isListed: true
        }).limit(4);

        relatedProducts.forEach(rp => {
            const rpPricing = getEffectivePrice(rp);
            rp.discountPrice = rpPricing.price;
        });

        
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
            inWishlist,
            offerActive: pricing.offerActive,
            offerName: pricing.offerName,
            offerDiscountValue: pricing.offerDiscountValue,
            offerDiscountType: pricing.offerDiscountType
        });
    } catch (error) {
        console.error("LOAD PRODUCT DETAIL ERROR:", error);
        res.status(500).send("Server error");
    }
};