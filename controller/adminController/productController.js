import Products from "../../model/productSchema.js";
import Category from "../../model/categoriesSchema.js";
import mongoose from "mongoose";
import { getEffectivePrice } from "../../utils/offerHelper.js";

export const loadProduct = async (req, res) => {
    try {
        if (!req.session.admin) return res.redirect('/admin');

        const {
            page = 1,
            limit = 10,
            search = '',
            status = 'all',
            sort = 'newest'
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        let query = {};
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }
        if (status === 'listed') {
            query.isListed = true;
        } else if (status === 'unlisted') {
            query.isListed = false;
        }

        let sortOption = { createdAt: -1 };
        switch (sort) {
            case 'price-asc': sortOption = { discountPrice: 1, basePrice: 1 }; break;
            case 'price-desc': sortOption = { discountPrice: -1, basePrice: -1 }; break;
            case 'name-asc': sortOption = { name: 1 }; break;
            case 'oldest': sortOption = { createdAt: 1 }; break;
        }

        const totalProducts = await Products.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limitNum);

        const products = await Products.find(query)
            .populate('category')
            .sort(sortOption)
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum);

        return res.render("admin/products", {
            title: "Products",
            products,
            currentPage: pageNum,
            totalPages,
            limit: limitNum,
            totalProducts,
            search,
            status,
            sort
        });
    } catch (error) {
        console.log(error);
        res.status(500).send("Server error");
    }
};



export const loadAddProduct = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect('/admin');
        }
        const categories = await Category.find({ isActive: true });
        return res.render("admin/addProduct", { title: "Add Product", categories })
    } catch (error) {
        console.log(error)
        res.status(500).send("Server error")
    }
}

export const addProduct = async (req, res) => {
    try {
        const { name, description, category, basePrice, discountPrice, variants: rawVariants } = req.body;
        const files = req.files || [];

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Product name is required" });
        }
        if (!description || !description.trim()) {
            return res.status(400).json({ success: false, message: "Description is required" });
        }
        if (!category) {
            return res.status(400).json({ success: false, message: "Category is required" });
        }
        if (!mongoose.Types.ObjectId.isValid(category)) {
            return res.status(400).json({ success: false, message: "Invalid category ID" });
        }

        const bPrice = parseFloat(basePrice);
        if (isNaN(bPrice) || bPrice <= 0) {
            return res.status(400).json({ success: false, message: "Base price must be a valid number greater than 0" });
        }

        let dPrice = bPrice;
        if (discountPrice !== undefined && discountPrice !== '') {
            dPrice = parseFloat(discountPrice);
            if (isNaN(dPrice) || dPrice <= 0) {
                return res.status(400).json({ success: false, message: "Discount price must be a valid number greater than 0" });
            }
            if (dPrice > bPrice) {
                return res.status(400).json({ success: false, message: "Discount price cannot be greater than base price" });
            }
        }

        let variants = [];
        try {
            variants = typeof rawVariants === 'string' ? JSON.parse(rawVariants) : rawVariants;
        } catch (e) {
            return res.status(400).json({ success: false, message: "Invalid variants format" });
        }

        if (!Array.isArray(variants) || variants.length === 0) {
            return res.status(400).json({ success: false, message: "At least one variant is required" });
        }

        const skus = variants.map(v => v.sku ? v.sku.trim() : '');
        if (skus.some(s => !s)) {
            return res.status(400).json({ success: false, message: "SKU is required for all variants" });
        }
        if (new Set(skus).size !== skus.length) {
            return res.status(400).json({ success: false, message: "Duplicate SKUs are not allowed within variants" });
        }

        const processedVariants = [];
        for (const [idx, v] of variants.entries()) {
            if (!v.color || !v.color.trim()) {
                return res.status(400).json({ success: false, message: `Variant ${idx + 1}: Color is required` });
            }
            if (v.stock === undefined || v.stock === '') {
                return res.status(400).json({ success: false, message: `Variant ${idx + 1}: Stock is required` });
            }
            const stockNum = parseInt(v.stock);
            if (isNaN(stockNum) || stockNum < 0) {
                return res.status(400).json({ success: false, message: `Variant ${idx + 1}: Stock must be a non-negative integer` });
            }

            const variantImages = files
                .filter(f => f.fieldname === `images-${v.tempId}`)
                .map(f => ({ url: f.secure_url || f.url || f.path }));
            
            if (variantImages.length !== 4) {
                return res.status(400).json({ success: false, message: `Variant ${idx + 1}: Exactly 4 images are required (Currently: ${variantImages.length})` });
            }

            processedVariants.push({
                sku: v.sku.trim(),
                color: v.color.trim(),
                stock: stockNum,
                images: variantImages
            });
        }

        const categoryDoc = await Category.findById(category);
        const pricing = getEffectivePrice({
            basePrice: bPrice,
            merchantDiscountPrice: dPrice
        }, categoryDoc);

        const product = await Products.create({
            name: name.trim(),
            description: description.trim(),
            category,
            basePrice: bPrice,
            discountPrice: pricing.price,
            merchantDiscountPrice: dPrice,
            variants: processedVariants
        });

        res.status(201).json({
            success: true,
            message: "Product created successfully",
            productId: product._id
        });

    } catch (error) {
        console.error("ADD PRODUCT ERROR:", error);
        let message = error.message || "Something went wrong";
        if (error.code === 11000) message = "A product with this SKU already exists";
        res.status(500).json({ success: false, message });
    }
};

export const loadEditProduct = async (req, res) => {
    try {
        if (!req.session.admin) return res.redirect('/admin');
        
        const product = await Products.findById(req.params.id).populate('category').lean();
        if (!product) return res.status(404).send("Product not found");
        
        const categories = await Category.find({});
        res.render("admin/editProduct", { title: "Edit Product", product, categories });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
};

export const editProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, category, basePrice, discountPrice, variants: rawVariants } = req.body;
        const files = req.files || [];

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Product name is required" });
        }
        if (!description || !description.trim()) {
            return res.status(400).json({ success: false, message: "Description is required" });
        }
        if (!category) {
            return res.status(400).json({ success: false, message: "Category is required" });
        }
        if (!mongoose.Types.ObjectId.isValid(category)) {
            return res.status(400).json({ success: false, message: "Invalid category ID" });
        }

        const product = await Products.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const bPrice = parseFloat(basePrice);
        if (isNaN(bPrice) || bPrice <= 0) {
            return res.status(400).json({ success: false, message: "Base price must be a valid number greater than 0" });
        }

        let merchantDPrice = bPrice;
        if (discountPrice !== undefined && discountPrice !== '') {
            merchantDPrice = parseFloat(discountPrice);
            if (isNaN(merchantDPrice) || merchantDPrice <= 0) {
                return res.status(400).json({ success: false, message: "Discount price must be a valid number greater than 0" });
            }
            if (merchantDPrice > bPrice) {
                return res.status(400).json({ success: false, message: "Discount price cannot be greater than base price" });
            }
        }
        merchantDPrice = Math.round(merchantDPrice * 100) / 100;

        const categoryDoc = await Category.findById(category);
        const pricing = getEffectivePrice({
            merchantDiscountPrice: merchantDPrice,
            basePrice: bPrice,
            offer: product.offer
        }, categoryDoc);
        let dPrice = pricing.price;

        let variants = [];
        try {
            variants = typeof rawVariants === 'string' ? JSON.parse(rawVariants) : rawVariants;
        } catch (e) {
            return res.status(400).json({ success: false, message: "Invalid variants format" });
        }
        
        if (!Array.isArray(variants) || variants.length === 0) {
            return res.status(400).json({ success: false, message: "At least one variant is required" });
        }

        const skus = variants.map(v => v.sku ? v.sku.trim() : '');
        if (skus.some(s => !s)) {
            return res.status(400).json({ success: false, message: "SKU is required for all variants" });
        }
        if (new Set(skus).size !== skus.length) {
            return res.status(400).json({ success: false, message: "Duplicate SKUs are not allowed within variants" });
        }

        const processedVariants = [];
        for (const [idx, v] of variants.entries()) {
            if (!v.color || !v.color.trim()) {
                return res.status(400).json({ success: false, message: `Variant ${idx + 1}: Color is required` });
            }
            if (v.stock === undefined || v.stock === '') {
                return res.status(400).json({ success: false, message: `Variant ${idx + 1}: Stock is required` });
            }
            const stockNum = parseInt(v.stock);
            if (isNaN(stockNum) || stockNum < 0) {
                return res.status(400).json({ success: false, message: `Variant ${idx + 1}: Stock must be a non-negative integer` });
            }

            let images = [];
            
            if (v.existingImages) {
                const kept = Array.isArray(v.existingImages) ? v.existingImages : [v.existingImages];
                images = kept.filter(url => typeof url === 'string' && url.length > 0).map(url => ({ url }));
            }

            const newImages = files
                .filter(f => f.fieldname === `images-${v.tempId}`)
                .map(f => ({ url: f.secure_url || f.url || f.path }));
            
            images = [...images, ...newImages];

            if (images.length !== 4) {
                return res.status(400).json({ success: false, message: `Variant ${idx + 1}: Exactly 4 images are required (Currently: ${images.length})` });
            }

            const variantObj = {
                sku: v.sku.trim(),
                color: v.color.trim(),
                stock: stockNum,
                images: images
            };

            if (v.tempId && v.tempId.startsWith('v')) {
                const possibleId = v.tempId.substring(1);
                if (mongoose.Types.ObjectId.isValid(possibleId)) {
                    variantObj._id = possibleId;
                }
            }

            processedVariants.push(variantObj);
        }

        const updated = await Products.findByIdAndUpdate(
            id,
            {
                name: name.trim(),
                description: description.trim(),
                category,
                basePrice: bPrice,
                discountPrice: dPrice,
                merchantDiscountPrice: merchantDPrice,
                variants: processedVariants
            },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ success: false, message: "Failed to update product" });
        }

        res.json({ success: true, message: "Product updated successfully" });

    } catch (error) {
        console.error("EDIT PRODUCT ERROR:", error);
        let message = error.message || "Update failed";
        if (error.code === 11000) message = "Another product with this SKU already exists";
        if (error.name === 'ValidationError') {
            message = "Validation Error: " + Object.values(error.errors).map(e => e.message).join(', ');
        }
        res.status(500).json({ success: false, message });
    }
};

export const toggleProductStatus = async (req, res) => {
    try {
        const product = await Products.findById(req.params.id);
        if (!product) return res.status(404).json({ message: "Product not found" });
        
        product.isListed = !product.isListed;
        await product.save();
        res.json({ success: true, message: `Product ${product.isListed ? 'listed' : 'unlisted'} successfully` });
    } catch (error) {
        res.status(500).json({ success: false, message: "Toggle failed" });
    }
};

export const deleteProduct = async (req, res) => {
    try {
        await Products.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Product deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Delete failed" });
    }
};

export const saveProductOffer = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const { id } = req.params;
        const { name, discountType, discountValue, startDate, endDate } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Offer name is required" });
        }
        if (name.trim().length < 3 || name.trim().length > 50) {
            return res.status(400).json({ success: false, message: "Offer name must be between 3 and 50 characters" });
        }

        if (!discountType || !["percentage", "flat"].includes(discountType)) {
            return res.status(400).json({ success: false, message: "Invalid discount type" });
        }

        const discVal = parseFloat(discountValue);
        if (isNaN(discVal) || discVal <= 0) {
            return res.status(400).json({ success: false, message: "Discount value must be a valid number greater than 0" });
        }

        const product = await Products.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const basePriceToUse = product.merchantDiscountPrice || product.discountPrice || product.basePrice;
        if (!product.merchantDiscountPrice) {
            product.merchantDiscountPrice = basePriceToUse;
        }

        if (discountType === "percentage" && (discVal < 1 || discVal > 99)) {
            return res.status(400).json({ success: false, message: "Percentage discount must be between 1 and 99" });
        }

        if (discountType === "flat" && discVal >= basePriceToUse) {
            return res.status(400).json({ success: false, message: "Flat discount must be less than the product's price" });
        }

        let start = null;
        let end = null;
        if (startDate) {
            start = new Date(startDate);
            if (isNaN(start.getTime())) {
                return res.status(400).json({ success: false, message: "Invalid start date" });
            }
        }
        if (endDate) {
            end = new Date(endDate);
            if (isNaN(end.getTime())) {
                return res.status(400).json({ success: false, message: "Invalid end date" });
            }
            if (start && end < start) {
                return res.status(400).json({ success: false, message: "End date must be after or equal to start date" });
            }
        }

        const categoryDoc = await Category.findById(product.category);

        product.offer = {
            name: name.trim(),
            discountType,
            discountValue: discVal,
            startDate: start,
            endDate: end
        };

        const pricing = getEffectivePrice(product, categoryDoc);
        product.discountPrice = pricing.price;

        await product.save();

        res.json({ success: true, message: "Offer saved successfully and product price updated" });
    } catch (error) {
        console.error("SAVE OFFER ERROR:", error);
        res.status(500).json({ success: false, message: "Server error saving offer" });
    }
};

export const deleteProductOffer = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const { id } = req.params;
        const product = await Products.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        product.offer = undefined;
        
        const categoryDoc = await Category.findById(product.category);
        const pricing = getEffectivePrice(product, categoryDoc);
        product.discountPrice = pricing.price;
        
        await product.save();

        res.json({ success: true, message: "Offer removed successfully and product price reverted" });
    } catch (error) {
        console.error("DELETE OFFER ERROR:", error);
        res.status(500).json({ success: false, message: "Server error removing offer" });
    }
};
