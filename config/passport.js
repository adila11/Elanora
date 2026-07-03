import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { User } from "../model/userSchema.js";


passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "/auth/google/callback",
        },
        async (accessToken, refreshToken, profile, done) => {
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
                    user = await User.create({
                        fullName: profile.displayName, 
                        email: email,
                        googleId: profile.id,
                        isGoogleUser: true,
                        password: null, 
                    });
                }

                return done(null, user);

            } catch (err) {
                console.log(" GOOGLE ERROR:", err); 
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