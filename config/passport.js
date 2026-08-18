import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { User } from "../model/userSchema.js";
import { creditWallet } from "../utils/walletHelper.js";
import Referral from "../model/referralSchema.js";


passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
            passReqToCallback: true,
        },
        async (req, accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails[0].value;

                let user = await User.findOne({ email });

                if (user) {
                    if (user.isBlocked) {
                        return done(null, false, { message: "Your account has been blocked by the admin" });
                    }
                    if (!user.googleId) {
                        user.googleId = profile.id;
                        user.isGoogleUser = true;
                        await user.save();
                    }
                } else {
                    const referredBy = req.session && req.session.referredBy || null;
                    user = await User.create({
                        fullName: profile.displayName,
                        email: email,
                        googleId: profile.id,
                        isGoogleUser: true,
                        password: null,
                        referredBy: referredBy
                    });

                    if (referredBy) {
                        const referrer = await User.findOne({ referralCode: referredBy });
                        if (referrer) {
                            await creditWallet({
                                userId: user._id,
                                amount: 100,
                                source: "referral",
                                description: `Referral bonus for signing up with Google and code ${referredBy}`
                            });

                            await creditWallet({
                                userId: referrer._id,
                                amount: 100,
                                source: "referral",
                                description: `Referral reward for inviting ${user.fullName}`
                            });

                            await Referral.create({
                                userId: referrer._id,
                                referredUserId: user._id,
                                referralCode: referredBy,
                                rewardAmount: 100,
                                status: "Completed",
                                rewardedAt: new Date()
                            });
                        }
                    }
                }

                return done(null, user);

            } catch (err) {
                return done(err, null);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});

export default passport;