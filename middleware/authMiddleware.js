import { User } from "../model/userSchema.js";

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
                message: 'Please login to continue'
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
            req.flash('error', "Your account has been blocked by the admin");
            return res.redirect("/login");
        }

        next();

    } catch (error) {
        next();
    }
};