import { User, UserOtp } from "../../model/userSchema.js"
import sentOtp from "../../utils/sendOtp.js";

export const loadProfile = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) return res.redirect("/login")
        const user = await User.findOne({ email: email });
        return res.render("user/profile/profile", { user })
    } catch (error) {
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

        if (fullName.trim().length > 40) {
            return res.status(400).json({
                success: false,
                message: "Full name cannot exceed 40 characters"
            });
        }

        if (!/^[A-Za-z\s]+$/.test(fullName.trim())) {
            return res.status(400).json({
                success: false,
                message: "Full name must contain only alphabets"
            });
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address"
            });
        }

        if (phone && !/^[6-9]\d{9}$/.test(phone.trim())) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid 10-digit mobile number starting with 6-9"
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
        res.status(500).json({
            success: false,
            message: "Something went wrong while updating profile"
        });
    }
};



export const sendCurrentEmailOtp = async (req, res) => {
    try {
        const currentEmail = req.session.user;
        if (!currentEmail) {
            return res.status(401).json({
                success: false,
                message: "Please login to continue"
            });
        }

        const user = await User.findOne({ email: currentEmail });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        await sentOtp(currentEmail, "editEmailCurrent");

        res.json({
            success: true,
            currentEmail,
            message: `Verification code sent to your current email (${currentEmail})`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Something went wrong while sending code to current email"
        });
    }
};

export const verifyCurrentEmailOtp = async (req, res) => {
    try {
        const currentEmail = req.session.user;
        if (!currentEmail) {
            return res.status(401).json({
                success: false,
                message: "Please login to continue"
            });
        }

        const { otp } = req.body;
        if (!otp || otp.length !== 6 || isNaN(otp)) {
            return res.status(400).json({
                success: false,
                message: "Valid 6-digit OTP is required"
            });
        }

        const userOtp = await UserOtp.findOne({ email: currentEmail }).sort({ createdAt: -1 });
        if (!userOtp) {
            return res.status(400).json({
                success: false,
                message: "No verification request found or code has expired"
            });
        }

        if (userOtp.otp != otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid verification code for current email"
            });
        }

        if (userOtp.expiresAt && Date.now() > new Date(userOtp.expiresAt).getTime()) {
            await UserOtp.deleteOne({ email: currentEmail });
            return res.status(400).json({
                success: false,
                message: "Verification code has expired"
            });
        }

        req.session.currentEmailVerified = true;
        await UserOtp.deleteOne({ email: currentEmail });

        res.json({
            success: true,
            message: "Current email verified successfully! Please enter your new email address."
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Something went wrong while verifying current email code"
        });
    }
};

export const sendNewEmailOtp = async (req, res) => {
    try {
        const currentEmail = req.session.user;
        if (!currentEmail) {
            return res.status(401).json({
                success: false,
                message: "Please login to continue"
            });
        }

        if (!req.session.currentEmailVerified) {
            return res.status(403).json({
                success: false,
                message: "Please verify your current email first before requesting code for new email"
            });
        }

        const { newEmail } = req.body;
        if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address"
            });
        }

        const sanitizedNewEmail = newEmail.trim().toLowerCase();

        if (sanitizedNewEmail === currentEmail.toLowerCase()) {
            return res.status(400).json({
                success: false,
                message: "New email cannot be the same as your current email"
            });
        }

        const existingUser = await User.findOne({ email: sanitizedNewEmail });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "This email is already in use by another account"
            });
        }

        await sentOtp(sanitizedNewEmail, "editEmailNew");

        res.json({
            success: true,
            newEmail: sanitizedNewEmail,
            message: `Verification code sent to your new email (${sanitizedNewEmail})`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Something went wrong while sending code to new email"
        });
    }
};

export const verifyNewEmailOtp = async (req, res) => {
    try {
        const currentEmail = req.session.user;
        if (!currentEmail) {
            return res.status(401).json({
                success: false,
                message: "Please login to continue"
            });
        }

        if (!req.session.currentEmailVerified) {
            return res.status(403).json({
                success: false,
                message: "Current email verification is required first"
            });
        }

        const { newEmail, otp } = req.body;
        if (!newEmail) {
            return res.status(400).json({
                success: false,
                message: "New email is required"
            });
        }

        const sanitizedNewEmail = newEmail.trim().toLowerCase();

        if (!otp || otp.length !== 6 || isNaN(otp)) {
            return res.status(400).json({
                success: false,
                message: "Valid 6-digit OTP is required"
            });
        }

        const userOtp = await UserOtp.findOne({ email: sanitizedNewEmail }).sort({ createdAt: -1 });
        if (!userOtp) {
            return res.status(400).json({
                success: false,
                message: "No verification request found or code has expired for new email"
            });
        }

        if (userOtp.otp != otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid verification code for new email"
            });
        }

        if (userOtp.expiresAt && Date.now() > new Date(userOtp.expiresAt).getTime()) {
            await UserOtp.deleteOne({ email: sanitizedNewEmail });
            return res.status(400).json({
                success: false,
                message: "Verification code has expired"
            });
        }

        const user = await User.findOne({ email: currentEmail });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        user.email = sanitizedNewEmail;
        await user.save();

        req.session.user = sanitizedNewEmail;
        req.session.currentEmailVerified = false;

        await UserOtp.deleteOne({ email: sanitizedNewEmail });

        res.json({
            success: true,
            newEmail: sanitizedNewEmail,
            message: "Email address updated successfully!"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Something went wrong while verifying new email code"
        });
    }
};

export const editEmail = sendNewEmailOtp;
export const verifyEmail = verifyNewEmailOtp;



export const loadPagenotFound = async (req, res) => {
    try {
        return res.status(404).render("user/profile/pageNotFound")
    } catch (error) {
        res.status(500).send("Server error")
    }
}




