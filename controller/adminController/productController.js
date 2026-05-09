import Products from "../../model/productSchema.js";
import Category from "../../model/categoriesSchema.js";
import mongoose from "mongoose";

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

        if (!name || !description || !category || !basePrice) {
            return res.status(400).json({ success: false, message: "All product fields are required" });
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

        const processedVariants = [];
        for (const [idx, v] of variants.entries()) {
            if (!v.sku || !v.color || v.stock === undefined) {
                return res.status(400).json({ success: false, message: `Variant ${idx + 1}: SKU, Color, and Stock are required` });
            }

            const variantImages = files
                .filter(f => f.fieldname === `images-${v.tempId}`)
                .map(f => ({ url: f.path }));
            
            if (variantImages.length !== 4) {
                return res.status(400).json({ success: false, message: `Variant ${idx + 1}: Exactly 4 images are required` });
            }

            processedVariants.push({
                sku: v.sku.trim(),
                color: v.color.trim(),
                stock: parseInt(v.stock) || 0,
                images: variantImages
            });
        }

        const product = await Products.create({
            name: name.trim(),
            description: description.trim(),
            category,
            basePrice: parseFloat(basePrice),
            discountPrice: parseFloat(discountPrice) || parseFloat(basePrice),
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

        if (!name || !description || !category || !basePrice) {
            return res.status(400).json({ success: false, message: "All product fields are required" });
        }

        const bPrice = parseFloat(basePrice);
        const dPrice = parseFloat(discountPrice) || bPrice;

        const product = await Products.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
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

        const processedVariants = [];
        for (const [idx, v] of variants.entries()) {
            if (!v.sku || !v.color || v.stock === undefined) {
                return res.status(400).json({ success: false, message: `Variant ${idx + 1}: SKU, Color, and Stock are required` });
            }

            let images = [];
            
            if (v.existingImages) {
                const kept = Array.isArray(v.existingImages) ? v.existingImages : [v.existingImages];
                images = kept.filter(url => typeof url === 'string' && url.length > 0).map(url => ({ url }));
            }

            const newImages = files
                .filter(f => f.fieldname === `images-${v.tempId}`)
                .map(f => ({ url: f.path }));
            
            images = [...images, ...newImages];

            if (images.length !== 4) {
                return res.status(400).json({ success: false, message: `Variant ${idx + 1}: Exactly 4 images are required (Currently: ${images.length})` });
            }

            const variantObj = {
                sku: v.sku.trim(),
                color: v.color.trim(),
                stock: parseInt(v.stock) || 0,
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



