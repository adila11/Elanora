import Referral from "../../model/referralSchema.js";
import {User} from "../../model/userSchema.js";

export const loadReferralPage = async (req, res) => {

    try {

        const email = req.session.user;

        const user = await User.findOne({email:email});
        const userId = user._id ;

        const referrals = await Referral.find({userId})
                .populate("referredUserId");

        const friendsInvited = referrals.length;

        const creditEarned = referrals.reduce((sum, item) => {
            return sum + item.rewardAmount;
        }, 0);

        const referral = {
            code: user.referralCode,
            giveAmount: 100,
            getAmount: 100,
            friendsInvited,
            creditEarned,
            history: referrals
        };

        res.render("user/referral", {
            user,
            referral
        });

    } catch (error) {
        console.log(error);
        res.redirect("/pageNotFound");

    }

}
