import bcrypt from 'bcrypt';
import { User } from "../../model/userSchema.js";


export const loadresetpassword = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) return res.redirect("/login")
        const user = await User.findOne({ email: email });
        return res.render("user/profile/resetPassword", { user })
    } catch (error) {
        res.status(500).send("Server error")
    }
}
export const resetpassword = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) {
            return res.redirect("/login");
        }

        const user = await User.findOne({ email: email });
        if (!user) {
            return res.redirect("/login");
        }

        const { oldPassword, newPassword, confirmPassword } = req.body;


        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                field: "old",         
                message: "Old password is incorrect"
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                field: "confirm",
                message: "Passwords do not match"
            });
        }

        if (oldPassword === newPassword) {
            return res.status(400).json({
                success: false,
                field: "new",
                message: "New password must be different from old password"
            });
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({
                success: false,
                field: "new",
                message: "Password must be 8+ chars with uppercase, lowercase & number"
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        req.flash("success", "Password updated successfully");
        return res.json({ success: true });   

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};