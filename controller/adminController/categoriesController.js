import { STATUS_CODES } from "../../constants/statusCodes.js";
import Category from "../../model/categoriesSchema.js";
import Products from "../../model/productSchema.js";
import { getEffectivePrice } from "../../utils/offerHelper.js";
import { MESSAGES } from '../../constants/messages.js';

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
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};

export const addCategory = async (req, res) => {
    try {
        if (!req.session.admin) return res.status(STATUS_CODES.UNAUTHORIZED).json({ message: MESSAGES.AUTH_UNAUTHORIZED });

        let { name, description } = req.body;

        if (!name || name.trim().length < 3) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ message: MESSAGES.PRODUCT_NAME_MUST_AT });
        }
        if (!/^[a-zA-Z0-9\s]+$/.test(name.trim())) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ message: MESSAGES.VALIDATION_ONLY_LETTERS_NUMBERS_SPACES });
        }

        const formattedName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);

        const existing = await Category.findOne({
            name: { $regex: `^${formattedName}$`, $options: 'i' }
        });
        if (existing) {
            return res.status(STATUS_CODES.CONFLICT).json({ message: "A category with this name already exists." });
        }

        const newCategory = new Category({ name: formattedName, description: description?.trim() });
        await newCategory.save();

        return res.status(STATUS_CODES.CREATED).json({
            message: "Category added successfully!",
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
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: MESSAGES.SERVER_ERROR_PLEASE_TRY_1 });
    }
};

export const editCategory = async (req, res) => {
    try {
        if (!req.session.admin) return res.status(STATUS_CODES.UNAUTHORIZED).json({ message: MESSAGES.AUTH_UNAUTHORIZED });

        const { id } = req.params;
        let { name, description } = req.body;

        if (!name || name.trim().length < 3) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ message: MESSAGES.PRODUCT_NAME_MUST_AT });
        }
        if (!/^[a-zA-Z0-9\s]+$/.test(name.trim())) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ message: MESSAGES.VALIDATION_ONLY_LETTERS_NUMBERS_SPACES });
        }

        const formattedName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);

        const duplicate = await Category.findOne({
            name: { $regex: `^${formattedName}$`, $options: 'i' },
            _id: { $ne: id }
        });
        if (duplicate) {
            return res.status(STATUS_CODES.CONFLICT).json({ message: "Another category with this name already exists." });
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

        if (!updated) return res.status(STATUS_CODES.NOT_FOUND).json({ message: MESSAGES.PRODUCT_NOT_FOUND_1 });

        return res.status(STATUS_CODES.OK).json({
            message: MESSAGES.PRODUCT_UPDATED_SUCCESSFULLY_1,
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
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: MESSAGES.SERVER_ERROR_PLEASE_TRY_1 });
    }
};

export const toggleCategory = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(STATUS_CODES.UNAUTHORIZED).json({ message: MESSAGES.AUTH_UNAUTHORIZED });
        }

        const cat = await Category.findById(req.params.id);

        if (!cat) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ message: MESSAGES.PRODUCT_NOT_FOUND_1 });
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

        return res.status(STATUS_CODES.OK).json({
            message: `Category ${cat.isActive ? 'listed' : 'unlisted'} successfully.`,
            isActive: cat.isActive
        });


    } catch (error) {
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteCategory = async (req, res) => {
    try {
        if (!req.session.admin) return res.status(STATUS_CODES.UNAUTHORIZED).json({ message: MESSAGES.AUTH_UNAUTHORIZED });

        const deleted = await Category.findByIdAndDelete(req.params.id);

        if (!deleted) return res.status(STATUS_CODES.NOT_FOUND).json({ message: MESSAGES.PRODUCT_NOT_FOUND_1 });

        return res.status(STATUS_CODES.OK).json({ message: MESSAGES.PRODUCT_DELETED_SUCCESSFULLY_1 });
    } catch (error) {
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
    }
};

export const saveCategoryOffer = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: MESSAGES.AUTH_UNAUTHORIZED });
        }

        const { id } = req.params;
        const { name, discountType, discountValue, startDate, endDate } = req.body;

        if (!name || !name.trim()) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON_OFFER_NAME_REQUIRED });
        }
        if (name.trim().length < 3 || name.trim().length > 50) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON_OFFER_NAME_MUST_BETWEEN });
        }

        if (!discountType || !["percentage", "flat"].includes(discountType)) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON_INVALID_DISCOUNT_TYPE });
        }

        const discVal = parseFloat(discountValue);
        if (isNaN(discVal) || discVal <= 0) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON_DISCOUNT_VALUE_MUST_VALID });
        }

        const category = await Category.findById(id);
        if (!category) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.PRODUCT_NOT_FOUND_1 });
        }

        if (discountType === "percentage" && (discVal < 1 || discVal > 99)) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON_PERCENTAGE_DISCOUNT_MUST_BETWEEN });
        }

        let start = null;
        let end = null;
        if (startDate) {
            start = new Date(startDate);
            if (isNaN(start.getTime())) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.VALIDATION_INVALID_START_DATE });
            }
        }
        if (endDate) {
            end = new Date(endDate);
            if (isNaN(end.getTime())) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.VALIDATION_INVALID_END_DATE });
            }
            if (start && end < start) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.VALIDATION_END_DATE_MUST_AFTER });
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

        const products = await Products.find({ category: id });
        for (const product of products) {
            if (!product.merchantDiscountPrice) {
                product.merchantDiscountPrice = product.discountPrice || product.basePrice;
            }
            const pricing = getEffectivePrice(product, category);
            product.discountPrice = pricing.price;
            await product.save();
        }

        res.status(STATUS_CODES.OK).json({ success: true, message: "Category offer saved successfully and product prices updated" });
    } catch (error) {
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error saving category offer" });
    }
};

export const deleteCategoryOffer = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: MESSAGES.AUTH_UNAUTHORIZED });
        }

        const { id } = req.params;
        const category = await Category.findById(id);
        if (!category) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.PRODUCT_NOT_FOUND_1 });
        }

        category.offer = undefined;
        await category.save();

        const products = await Products.find({ category: id });
        for (const product of products) {
            if (!product.merchantDiscountPrice) {
                product.merchantDiscountPrice = product.discountPrice || product.basePrice;
            }
            const pricing = getEffectivePrice(product, category);
            product.discountPrice = pricing.price;
            await product.save();
        }

        res.status(STATUS_CODES.OK).json({ success: true, message: "Category offer removed successfully and product prices reverted" });
    } catch (error) {
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error removing category offer" });
    }
};
