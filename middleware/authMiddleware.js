import { User } from "../model/userSchema.js";
import { MESSAGES } from '../constants/messages.js';

export const isLoggedIn = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        if (
            req.xhr ||
            req.headers['x-requested-with'] === 'XMLHttpRequest' ||
            req.headers['content-type'] === 'application/json' ||
            (req.headers.accept && req.headers.accept.includes('application/json'))
        ) {
            return res.status(401).json({
                success: false,
                notLoggedIn: true,
                message: MESSAGES.AUTH_PLEASE_LOGIN_CONTINUE
            });
        }
        res.redirect("/login");
    }
};


export const isBlocked = async (req, res, next) => {
    try {
        const userEmail = req.session.user;

        const user = await User.findOne({ email: userEmail });

        if (!user || user.isBlocked) {
            delete req.session.user;
            req.flash('error', MESSAGES.AUTH_ACCOUNT_BLOCKED_BY_ADMIN);
            return res.redirect("/login");
        }

        next();

    } catch (error) {
        next();
    }
};