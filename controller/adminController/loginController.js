import Admin from "../../model/adminSchema.js";
import bcrypt from "bcrypt";
import { MESSAGES } from '../../constants/messages.js';

export const loadLogin = async (req, res) => {
    try {
        if (req.session.admin) {
            return res.redirect('/admin/dashboard');
        }

        return res.render("admin/login", { error: null });

    } catch (error) {
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};

export const login = async (req, res) => {
    try {
        if (req.session.admin) {
            return res.redirect('/admin/dashboard');
        }

        const { email, password } = req.body;

        if (!email || !password) {
            return res.render("admin/login", {
                error: MESSAGES.VALIDATION_ALL_FIELDS_REQUIRED
            });
        }

        const admin = await Admin.findOne({ email });

        if (!admin) {
            return res.render("admin/login", {
                error: "Admin not found"
            });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.render("admin/login", {
                error: "Admin password incorrect"
            });
        }

        req.session.admin = email;

        res.redirect("/admin/dashboard")

    } catch (error) {
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};





export const logout = async (req, res) => {
    try {
        delete req.session.admin
        return res.redirect("/admin")
    } catch (error) {
        return res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }

}