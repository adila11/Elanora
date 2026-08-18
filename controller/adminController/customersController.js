import { User } from "../../model/userSchema.js";
import { MESSAGES } from '../../constants/messages.js';

export const loadUserManagement = async (req, res) => {
    try {
        const email = req.session.admin;
        if (!email) return res.redirect('/admin');

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
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        if (status === 'active') {
            query.isBlocked = false;
        } else if (status === 'blocked') {
            query.isBlocked = true;
        }

        let sortOption = {};
        if (sort === 'newest') {
            sortOption = { createdAt: -1 };
        } else if (sort === 'oldest') {
            sortOption = { createdAt: 1 };
        }

        const totalUsers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalUsers / limitNum);

        const users = await User.find(query)
            .sort(sortOption)
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean(); 

        res.render("admin/customers", {
            title: "Customers",
            users,
            currentPage: pageNum,
            totalPages,
            limit: limitNum,
            totalUsers,
            search: search || '',
            status: status || 'all',
            sort: sort || 'newest'
        });

    } catch (error) {
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};

export const blockUser = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ success: false, message: MESSAGES.AUTH_UNAUTHORIZED });
        }

        const { id } = req.params;
        const { isBlocked } = req.body;

        if (!id || typeof isBlocked !== 'boolean') {
            return res.status(400).json({ 
                success: false, 
                message: "Missing id or isBlocked (must be boolean)" 
            });
        }

        const user = await User.findByIdAndUpdate(
            id,
            { isBlocked },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ success: false, message: MESSAGES.USER_NOT_FOUND });
        }

        res.json({
            success: true,
            message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`,
            isBlocked: user.isBlocked
        });

    } catch (error) {
        res.status(500).json({ success: false, message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
    }
}


