import Category from "../../model/categoriesSchema.js";

// ─── Page Render ─────────────────────────────────────────────────────────────
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
            { name: formattedName, description: description?.trim() },
            { new: true }
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

// ─── JSON API: Toggle Active ──────────────────────────────────────────────────
export const toggleCategory = async (req, res) => {
    try {
        if (!req.session.admin) return res.status(401).json({ message: 'Unauthorized' });

        const cat = await Category.findById(req.params.id);
        if (!cat) return res.status(404).json({ message: 'Category not found.' });

        cat.isActive = !cat.isActive;
        await cat.save();

        return res.json({ message: `Category ${cat.isActive ? 'listed' : 'unlisted'} successfully.`, isActive: cat.isActive });
    } catch (error) {
        console.error("TOGGLE CATEGORY ERROR:", error);
        res.status(500).json({ message: 'Server error.' });
    }
};

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
