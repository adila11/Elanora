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

        // Basic Validation
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

        // Find user
        const user = await User.findOne({ email: userEmail });   // Import your User model
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Update fields
        let updated = false;

        if (fullName && fullName !== user.fullName) {
            user.fullName = fullName.trim();
            updated = true;
        }

        if (email && email !== user.email) {
            // You already verified email via OTP, so we can trust it now
            user.email = email.trim().toLowerCase();
            updated = true;
        }

        if (phone !== undefined && phone !== user.phone) {
            user.phone = phone.trim() || null;
            updated = true;
        }

        // Handle profile picture
        if (req.file) {
            // Optional: Delete old image from Cloudinary if not default
            if (user.profileIcon && user.profileIcon !== "default.png" && user.cloudinaryId) {
                try {
                    await cloudinary.uploader.destroy(user.cloudinaryId);
                } catch (err) {
                    console.log("Failed to delete old image:", err);
                }
            }

            user.profileIcon = req.file.path;           // Cloudinary URL
            user.cloudinaryId = req.file.filename;      // Public ID for later deletion
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
            }
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

        // Find current user
        const user = await User.findOne({ email: req.session.user });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Check if new email is already taken 
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

        // Send OTP
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

        // Proper Validation
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

        // Find OTP record
        const userOtp = await UserOtp
            .findOne({ email: newEmail })
            .sort({ createdAt: -1 });

        if (!userOtp) {
            return res.status(400).json({
                success: false,
                message: "No OTP request found or code has expired"
            });
        }

        // Check if OTP matches
        if (userOtp.otp != otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid verification code"
            });
        }

        // Check if OTP is expired (assuming you have expiresAt field)
        if (userOtp.expiresAt && Date.now() > new Date(userOtp.expiresAt).getTime()) {
            await UserOtp.deleteOne({ email: newEmail }); // cleanup
            return res.status(400).json({
                success: false,
                message: "Verification code has expired"
            });
        }

        // Find current user
        const user = await User.findOne({ email: req.session.user });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Update email
        user.email = newEmail;
        await user.save();
        req.session.user = newEmail ;

        // Delete used OTP (Important for security)
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


