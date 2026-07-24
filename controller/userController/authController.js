import sentOtp from "../../utils/sendOtp.js";
import { UserOtp, User } from "../../model/userSchema.js";
import { creditWallet } from "../../utils/walletHelper.js";
import Referral from "../../model/referralSchema.js";
import bcrypt from "bcrypt";
import { error } from "console";

export const loadLogin = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }

        return res.render("user/auth/login/login", { error: null });

    } catch (error) {
        console.log(error);
        res.status(500).send("Server error");
    }
};

export const login = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }

        const { email, password } = req.body;

        if (!email || !password) {
            req.flash('error', "All fields are required");
            return res.redirect("/login");
        }

        const user = await User.findOne({ email });

        if (!user) {
            req.flash('error', "User not found");
            return res.redirect("/login");
        }
        if (user.isBlocked) {
            req.flash('error', "Your account has been blocked by the admin");
            return res.redirect("/login");
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            req.flash('error', "Invalid password");
            return res.redirect("/login");
        }

        req.session.user = user.email;
        console.log(req.session.user);
        
        req.flash('success', "Logged in successfully!");
        return res.redirect('/');

    } catch (error) {
        console.log(error);
        return res.status(500).send("Server Error");
    }
};

export const loadforgotpassword = async (req,res) =>{
    try {
        if(req.session.user){
            return res.redirect("/")
        }
        return res.render("user/auth/forgotpassword/forgotpassword")
    } catch (error) {
        console.log(error);
        return res.status(500).send("Server Error");
    }
}

export const forgotpassword = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect("/");
        }

        const {email}  = req.body

        if (!email) {
            req.flash('error', 'Please enter your email address');
            return res.redirect('/forgotpassword');
        }

        const user = await User.findOne({ email: email });

        if (!user) {
            req.flash('error', 'Email is Invalid');
            return res.redirect('/forgotpassword');
        }

        req.flash('success', 'Verification code has been sent to your email');

        sentOtp(email,"forgotpassword")

        req.session.tempUser = email
        return res.redirect('/forgotpassword-otpverify');   
    } catch (error) {
        console.error(error);
        req.flash('error', 'Something went wrong. Please try again.');
        return res.redirect('/forgotpassword');
    }
};
 

export const loadforgotpassOTPVerification = async (req,res)=>{
    try {
        if(req.session.user){
            return res.redirect("/")
        } 
        if(!req.session.tempUser) return res.redirect("/forgotpassword")
        return res.render("user/auth/forgotpassword/forgotpass-otp")
    } catch (error) {
        console.log(error)
        res.status(500).send("Server error")
    }
}


export const forgotpassOTPVerification = async (req,res)=>{
    try {
        if(req.session.user){
            return res.redirect("/")
        } 
        const {otp} =req.body;
        const email=req.session.tempUser
        const userOtp= await UserOtp.findOne({email:email})
        
        if (!userOtp) {
            req.flash('error', 'Otp has expired. Please request a new one.');
            return res.redirect('/forgotpassword-otpverify');
        }
        
        if(otp!=userOtp.otp){
            req.flash('error', 'Otp Is Invalid');
            return res.redirect('/forgotpassword-otpverify');
        }
        req.session.isVerified = true ;
        return res.redirect('/newpassword')

    } catch (error) {
        console.log(error)
        res.status(500).send("Server error")
    }
}

export const loadnewpassword = async (req,res) => {
    try {
        if(req.session.user){
            return res.redirect("/")
        } 
        if(!req.session.isVerified && req.session.isVerified !== true){
            return res.redirect('/forgotpassword')
        }
        if(!req.session.tempUser) return res.redirect('/forgotpassword')

        return res.render("user/auth/forgotpassword/newpassword")
    } catch (error) {
        console.log(error)
        res.status(500).send("Server error")
    }
}


export const newpassword = async (req,res)=>{
    try {
        if(req.session.user){
            return res.redirect("/")
        }
        const email = req.session.tempUser ;
        if(!email)return res.redirect("/forgotpassword")

        const {newPassword,confirmPassword} = req.body
        if(newPassword!=confirmPassword){
            req.flash("error","New Password and Confirm Passwords do not match");
            return res.redirect('/newpassword') ;
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

        if(!passwordRegex.test(newPassword)){
            req.flash("error","Password must be at least 8 characters long and include uppercase, lowercase, and a number");
            return res.redirect('/newpassword') ;
        }

        const hashedPassword=await bcrypt.hash(newPassword,10) ; 

        const user=await User.findOne({email:email})

        if(!user) return res.redirect("/forgotpassword")

        user.password=hashedPassword ;
        await user.save()

        delete req.session.tempUser ;
        delete req.session.isVerified ;
        
        req.flash("success","Password has been reseted")


        return res.redirect("/login")

    } catch (error) {
        console.log(error)
        res.status(500).send("Server error")
    }
}


export const loadSignup = async (req, res) => {
    try {
        if(req.session.user){
            return res.redirect("/")
        } 
        return res.render("user/auth/signup/signup")
    } catch (error) {
        console.log(error)
        res.status(500).send("Server error")
    }
}

export const signup = async (req, res) => {
    try {
        const { fullName, email, password, confirmPassword, referralCode, agreeTerms } = req.body;

        
        if (!fullName || !email || !password || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "All fields are required",
                field: "fullName" 
            });
        }


        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already exists",
                field: "email"
            });
        }


        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Passwords do not match",
                field: "confirmPassword"
            });
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

        if(!passwordRegex.test(password)){
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long and include uppercase, lowercase, and a number",
                field: "confirmPassword"
            });
        }


        if (!agreeTerms) {
            return res.status(400).json({
                success: false,
                message: "You must accept the Terms of Service and Privacy Policy",
                field: "terms"
            });
        }
        if (referralCode && referralCode.trim()) {
            const referrer = await User.findOne({ referralCode: referralCode.trim() });
            if (!referrer) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid referral code",
                    field: "referralCode"
                });
            }
        }

        req.session.tempUser = {
            name: fullName,
            email: email.toLowerCase(),
            password: password,
            referredBy: (referralCode && referralCode.trim()) || null
        };


        await sentOtp(email,"signup");


        return res.status(200).json({
            success: true,
            message: "OTP sent successfully",
            redirect: "/signup-verification"
        });

    } catch (error) {
        console.error("Signup Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error. Please try again later."
        });
    }
};


export const loadSignupOTPVerification = async (req, res) => {
    try {
        if (!req.session.tempUser) return res.redirect("/signup");
        return res.render("user/auth/signup/signup-otp")
    } catch (error) {
        console.log(error)
        return res.status(500).send("Server Error");
    }

}
export const SignupOTPVerification = async (req, res) => {
    try {
        const tempUser = req.session.tempUser;
        if (!tempUser) return res.redirect("/signup");

        const existingUser = await User.findOne({ email: tempUser.email });
        if (existingUser) {
            await UserOtp.deleteOne({ email: tempUser.email });
            req.session.user = existingUser.email;
            delete req.session.tempUser;
            req.flash('success', "Account created successfully!");
            return res.redirect('/');
        }

        const otp = req.body.otp;
        if (!otp) {
            req.flash('error', "Please Enter the Otp");
            return res.redirect("/signup-verification");
        }

        const userOtp = await UserOtp.findOne({ email: tempUser.email })

        if (!userOtp) {
            req.flash('error', "OTP has expired. Please request a new one.");
            return res.redirect("/signup-verification");
        }

        if (userOtp.otp != otp) {
            req.flash('error', "The Otp Is Incorrect");
            return res.redirect("/signup-verification");
        }

        const hashedPassword=await bcrypt.hash(tempUser.password,10)

        const newUser = new User({
            fullName: tempUser.name,
            email: tempUser.email,
            password: hashedPassword,
            referredBy: tempUser.referredBy || null
        })

        await newUser.save();

        if (tempUser.referredBy) {
            const referrer = await User.findOne({ referralCode: tempUser.referredBy });
            if (referrer) {
                await creditWallet({
                    userId: newUser._id,
                    amount: 100,
                    source: "referral",
                    description: `Referral bonus for signing up with code ${tempUser.referredBy}`
                });

                await creditWallet({
                    userId: referrer._id,
                    amount: 100,
                    source: "referral",
                    description: `Referral reward for inviting ${newUser.fullName}`
                });

                await Referral.create({
                    userId: referrer._id,
                    referredUserId: newUser._id,
                    referralCode: tempUser.referredBy,
                    rewardAmount: 100,
                    status: "Completed",
                    rewardedAt: new Date()
                });
            }
        }

        await UserOtp.deleteOne({ email: tempUser.email });

        req.session.user = tempUser.email;
        
        req.flash('success', "Account created successfully!");
        return res.redirect('/');

    } catch (error) {
        console.log(error)
        return res.status(500).send("Server Error");
    }
}



export const logout = async (req, res) => {
    try {
        delete req.session.user;
        return res.redirect("/");
    } catch (error) {
        console.log(error);
        return res.status(500).send("Server Error");
    }
};

export const resendOtp = async (req, res) => {
    try {
        const tempUser = req.session.tempUser;
        if (!tempUser) {
            return res.status(400).json({ success: false, message: "Session expired. Please start over." });
        }

        const email = typeof tempUser === 'string' ? tempUser : tempUser.email;
        const purpose = typeof tempUser === 'string' ? "forgotpassword" : "signup";

        await sentOtp(email, purpose);

        return res.status(200).json({
            success: true,
            message: "New OTP sent successfully"
        });

    } catch (error) {
        console.error("Resend OTP Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to resend OTP. Please try again."
        });
    }
};



