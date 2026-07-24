import { User, UserOtp } from "../../model/userSchema.js"
import sentOtp from "../../utils/sendOtp.js";

export const loadProfile = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) return res.redirect("/login")
        const user = await User.findOne({ email: email });
        return res.render("user/profile/profile", { user })
    } catch (error) {
        console.log(error)
        res.status(500).send("Server error")
    }
}



export const editProfile = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const { fullName, email, phone } = req.body;
        const userEmail = req.session.user;

        if (!fullName || fullName.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: "Full name is required and must be at least 2 characters"
            });
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address"
            });
        }

        if (phone && !/^\+?\d{10,15}$/.test(phone.replace(/\s/g, ''))) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid phone number"
            });
        }

        const user = await User.findOne({ email: userEmail });   
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        let updated = false;

        if (fullName && fullName !== user.fullName) {
            user.fullName = fullName.trim();
            updated = true;
        }

        if (email && email !== user.email) {
            user.email = email.trim().toLowerCase();
            updated = true;
        }

        if (phone !== undefined && phone !== user.phone) {
            user.phone = phone.trim() || null;
            updated = true;
        }

        if (req.file) {
            console.log(req.file)
            user.profileIcon = req.file.secure_url || req.file.url || req.file.path;           
            user.cloudinaryId = req.file.public_id || req.file.filename;      
            updated = true;
        }

        if (!updated) {
            return res.status(200).json({
                success: true,
                message: "No changes detected"
            });
        }

        await user.save();


        res.status(200).json({
            success: true,
            message: "Profile updated successfully!",
            user: {
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                profileIcon: user.profileIcon
            },
            redirect:"/profile"
        });

    } catch (error) {
        console.error("Profile update error:", error);
        res.status(500).json({
            success: false,
            message: "Something went wrong while updating profile"
        });
    }
};



export const editEmail = async (req, res) => {
    try {
        const { newEmail } = req.body;

        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: "Please login to continue"
            });
        }

        if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address"
            });
        }

        const user = await User.findOne({ email: req.session.user });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const existingUser = await User.findOne({
            email: newEmail,
            _id: { $ne: user._id }
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "This email is already in use by another account"
            });
        }

        await sentOtp(newEmail, "editEmail");

        res.json({
            success: true,
            message: "Verification code sent to your new email"
        });

    } catch (error) {
        console.error("Send OTP Error:", error);
        res.status(500).json({
            success: false,
            message: "Something went wrong while sending OTP"
        });
    }
}

export const verifyEmail = async (req, res) => {
    try {
        console.log("Flag")
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: "Please login to continue"
            });
        }

        const { newEmail, otp } = req.body;

        if (!newEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        if (!otp || otp.length !== 6 || isNaN(otp)) {
            return res.status(400).json({
                success: false,
                message: "Valid 6-digit OTP is required"
            });
        }

        const userOtp = await UserOtp
            .findOne({ email: newEmail })
            .sort({ createdAt: -1 });

        if (!userOtp) {
            return res.status(400).json({
                success: false,
                message: "No OTP request found or code has expired"
            });
        }

        if (userOtp.otp != otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid verification code"
            });
        }

        if (userOtp.expiresAt && Date.now() > new Date(userOtp.expiresAt).getTime()) {
            await UserOtp.deleteOne({ email: newEmail }); 
            return res.status(400).json({
                success: false,
                message: "Verification code has expired"
            });
        }

        const user = await User.findOne({ email: req.session.user });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        user.email = newEmail;
        await user.save();
        req.session.user = newEmail ;

        await UserOtp.deleteOne({ email: newEmail });

        res.json({
            success: true,
            message: "Email updated successfully!"
        });

    } catch (error) {
        console.error("Verify Email OTP Error:", error);
        res.status(500).json({
            success: false,
            message: "Something went wrong during verification"
        });
    }
}



export const loadPagenotFound = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) return res.redirect("/login")
        return res.render("user/profile/pageNotFound")
    } catch (error) {
        console.log(error)
        res.status(500).send("Server error")
    }
}




