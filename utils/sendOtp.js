import nodemailer from "nodemailer";
import { UserOtp } from "../model/userSchema.js";

const sentOtp = async (email, purpose = "verification") => {
    try {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        await UserOtp.deleteMany({ email });

        const newOtp = new UserOtp({
            email,
            otp,
            purpose, 
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        await newOtp.save();

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        let subject = "";
        let message = "";

        switch (purpose) {
            case "signup":
                subject = "Signup OTP Verification";
                message = `Welcome! Your signup OTP is ${otp}. It expires in 5 minutes.`;
                break;

            case "forgotpassword":
                subject = "Password Reset OTP";
                message = `Use this OTP to reset your password: ${otp}. It expires in 5 minutes.`;
                break;

            case "editEmail":
            case "editEmailNew":
                subject = "Verify New Email OTP";
                message = `Use this OTP to verify your new email address: ${otp}. It expires in 5 minutes.`;
                break;

            case "editEmailCurrent":
                subject = "Security Verification - Current Email OTP";
                message = `Use this OTP to verify ownership of your current email address: ${otp}. It expires in 5 minutes.`;
                break;

            default:
                subject = "OTP Verification";
                message = `Your OTP is ${otp}. It expires in 5 minutes.`;
        }

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject,
            text: message
        });

        console.log(`OTP (${purpose}):`, otp);

    } catch (error) {
        console.log("OTP Error:", error);
    }
};

export default sentOtp;