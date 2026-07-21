import Category from "../../model/categoriesSchema.js";
import Products from "../../model/productSchema.js";
import { getEffectivePrice } from "../../utils/offerHelper.js";

// Load Categories
export const loadCategories = async (req, res) => {
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
        if (status === 'active') {
            query.isActive = true;
        } else if (status === 'inactive') {
            query.isActive = false;
        }

        let sortOption = { createdAt: -1 };
        switch (sort) {
            case 'name-asc': sortOption = { name: 1 }; break;
            case 'name-desc': sortOption = { name: -1 }; break;
            case 'oldest': sortOption = { createdAt: 1 }; break;
        }

        const totalCategories = await Category.countDocuments(query);
        const totalPages = Math.ceil(totalCategories / limitNum);

        const categories = await Category.find(query)
            .sort(sortOption)
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum);

        const formatted = categories.map(cat => ({
            _id: cat._id,
            name: cat.name,
            description: cat.description || '',
            isActive: cat.isActive,
            discountPercentage: cat.discountPercentage,
            productCount: cat.productIds.length,
            offer: cat.offer,
            createdAt: cat.createdAt
        }));

        res.render('admin/categories', {
            categories: formatted,
            title: 'Categories',
            currentPage: pageNum,
            totalPages,
            limit: limitNum,
            totalCategories,
            search,
            status,
            sort
        });
    } catch (error) {
        console.error("LOAD CATEGORIES ERROR:", error);
        res.status(500).send("Server error");
    }
};

// Add Category
export const addCategory = async (req, res) => {
    try {
        if (!req.session.admin) return res.status(401).json({ message: 'Unauthorized' });

        let { name, description } = req.body;

        if (!name || name.trim().length < 3) {
            return res.status(400).json({ message: 'Category name must be at least 3 characters.' });
        }
        if (!/^[a-zA-Z0-9\s]+$/.test(name.trim())) {
            return res.status(400).json({ message: 'Only letters, numbers and spaces are allowed.' });
        }

        const formattedName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);

        const existing = await Category.findOne({
            name: { $regex: `^${formattedName}$`, $options: 'i' }
        });
        if (existing) {
            return res.status(409).json({ message: 'A category with this name already exists.' });
        }

        const newCategory = new Category({ name: formattedName, description: description?.trim() });
        await newCategory.save();

        return res.status(201).json({
            message: 'Category added successfully!',
            category: {
                _id: newCategory._id,
                name: newCategory.name,
                description: newCategory.description || '',
                isActive: newCategory.isActive,
                productCount: 0,
                createdAt: newCategory.createdAt
            }
        });
    } catch (error) {
        console.error("ADD CATEGORY ERROR:", error);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
};

// Edit Category
export const editCategory = async (req, res) => {
    try {
        if (!req.session.admin) return res.status(401).json({ message: 'Unauthorized' });

        const { id } = req.params;
        let { name, description } = req.body;

        if (!name || name.trim().length < 3) {
            return res.status(400).json({ message: 'Category name must be at least 3 characters.' });
        }
        if (!/^[a-zA-Z0-9\s]+$/.test(name.trim())) {
            return res.status(400).json({ message: 'Only letters, numbers and spaces are allowed.' });
        }

        const formattedName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);

        const duplicate = await Category.findOne({
            name: { $regex: `^${formattedName}$`, $options: 'i' },
            _id: { $ne: id }
        });
        if (duplicate) {
            return res.status(409).json({ message: 'Another category with this name already exists.' });
        }

        const updated = await Category.findByIdAndUpdate(
            id,
            {
                name: formattedName,
                description: description?.trim()
            },
            {
                returnDocument: "after"
            }
        );

        if (!updated) return res.status(404).json({ message: 'Category not found.' });

        return res.json({
            message: 'Category updated successfully!',
            category: {
                _id: updated._id,
                name: updated.name,
                description: updated.description || '',
                isActive: updated.isActive,
                productCount: updated.productIds.length,
                createdAt: updated.createdAt
            }
        });
    } catch (error) {
        console.error("EDIT CATEGORY ERROR:", error);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
};

// Toggle Category
export const toggleCategory = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const cat = await Category.findById(req.params.id);

        if (!cat) {
            return res.status(404).json({ message: 'Category not found.' });
        }
        cat.isActive = !cat.isActive;

        await cat.save();

        await Products.updateMany(
            {
                category: cat._id
            },
            {
                $set: {
                    isListed: cat.isActive
                }
            }
        );

        return res.json({
            message: `Category ${cat.isActive ? 'listed' : 'unlisted'} successfully.`,
            isActive: cat.isActive
        });


    } catch (error) {
        console.error("TOGGLE CATEGORY ERROR:", error);
        res.status(500).json({
            message: "Server error."
        });
    }
};

// Delete Category
export const deleteCategory = async (req, res) => {
    try {
        if (!req.session.admin) return res.status(401).json({ message: 'Unauthorized' });

        const deleted = await Category.findByIdAndDelete(req.params.id);
        
        if (!deleted) return res.status(404).json({ message: 'Category not found.' });

        return res.json({ message: 'Category deleted successfully.' });
    } catch (error) {
        console.error("DELETE CATEGORY ERROR:", error);
        res.status(500).json({ message: 'Server error.' });
    }
};

// Save Category Offer
export const saveCategoryOffer = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const { id } = req.params;
        const { name, discountType, discountValue, startDate, endDate } = req.body;

        // Validation Checks
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

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        if (discountType === "percentage" && (discVal < 1 || discVal > 99)) {
            return res.status(400).json({ success: false, message: "Percentage discount must be between 1 and 99" });
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

        category.offer = {
            name: name.trim(),
            discountType,
            discountValue: discVal,
            startDate: start,
            endDate: end
        };

        await category.save();

        // Update All Products In This Category
        const products = await Products.find({ category: id });
        for (const product of products) {
            if (!product.merchantDiscountPrice) {
                product.merchantDiscountPrice = product.discountPrice || product.basePrice;
            }
            const pricing = getEffectivePrice(product, category);
            product.discountPrice = pricing.price;
            await product.save();
        }

        res.json({ success: true, message: "Category offer saved successfully and product prices updated" });
    } catch (error) {
        console.error("SAVE CATEGORY OFFER ERROR:", error);
        res.status(500).json({ success: false, message: "Server error saving category offer" });
    }
};

// Delete Category Offer
export const deleteCategoryOffer = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const { id } = req.params;
        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        category.offer = undefined;
        await category.save();

        // Update All Products In This Category
        const products = await Products.find({ category: id });
        for (const product of products) {
            if (!product.merchantDiscountPrice) {
                product.merchantDiscountPrice = product.discountPrice || product.basePrice;
            }
            const pricing = getEffectivePrice(product, category);
            product.discountPrice = pricing.price;
            await product.save();
        }

        res.json({ success: true, message: "Category offer removed successfully and product prices reverted" });
    } catch (error) {
        console.error("DELETE CATEGORY OFFER ERROR:", error);
        res.status(500).json({ success: false, message: "Server error removing category offer" });
    }
};
