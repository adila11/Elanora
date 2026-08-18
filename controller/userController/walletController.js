import { User } from "../../model/userSchema.js";
import Wallet from "../../model/walletSchema.js";
import WalletTransaction from "../../model/walletTransactionSchema.js";
import { creditWallet } from "../../utils/walletHelper.js";
import razorpay from "../../config/razorpay.js";
import crypto from "crypto";
import { MESSAGES } from '../../constants/messages.js';


export const loadWallet = async (req, res) => {
    try {

        const email = req.session.user;

        if (!email) {
            return res.redirect("/login");
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.redirect("/login");
        }

        let wallet = await Wallet.findOne({ userId: user._id, });

        if (!wallet) {
            wallet = await Wallet.create({
                userId: user._id,
                balance: 0,
            });
        }

        const transactions = await WalletTransaction
            .find({ walletId: wallet._id })
            .sort({ createdAt: -1 });

        res.render("user/wallet/wallet", {
            user,
            wallet,
            transactions,
        });

    } catch (error) {
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};


export const loadWalletTransactions = async (req, res) => {
    try {

        const email = req.session.user;

        if (!email) {
            return res.redirect("/login");
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.redirect("/login");
        }

        const wallet = await Wallet.findOne({ userId: user._id });

        if (!wallet) {
            return res.redirect("/wallet");
        }

        const allTransactions = await WalletTransaction
            .find({ walletId: wallet._id })
            .sort({ createdAt: -1 });

        const totalTransactions = allTransactions.length;
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const totalPages = Math.ceil(totalTransactions / limit) || 1;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        
        const transactions = allTransactions.slice(startIndex, endIndex);

        const totalCredits = allTransactions
            .filter(txn => txn.type === "credit")
            .reduce((sum, txn) => sum + txn.amount, 0);

        const totalDebits = allTransactions
            .filter(txn => txn.type === "debit")
            .reduce((sum, txn) => sum + txn.amount, 0);

        const summary = {
            totalCredits,
            totalDebits
        };

        res.render("user/wallet/walletTransaction", {
            user,
            wallet,
            transactions,
            summary,
            currentPage: page,
            totalPages
        });

    } catch (error) {
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};

export const createWalletTopupOrder = async (req, res) => {
    try {
        const { amount } = req.body;
        const numAmount = Number(amount);

        if (!numAmount || numAmount < 100) {
            return res.status(400).json({
                success: false,
                message: MESSAGES.USER_MINIMUM_WALLET_TOPUP_AMOUNT
            });
        }

        if (numAmount > 50000) {
            return res.status(400).json({
                success: false,
                message: MESSAGES.USER_MAXIMUM_WALLET_TOPUP_AMOUNT
            });
        }

        const options = {
            amount: Math.round(numAmount * 100),
            currency: "INR",
            receipt: `wallet_${Date.now()}`
        };

        const razorpayOrder = await razorpay.orders.create(options);

        res.json({
            success: true,
            order: razorpayOrder,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to create payment"
        });
    }
};

export const verifyWalletPayment = async (req, res) => {
    try {

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            amount
        } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
            return res.status(400).json({
                success: false,
                message: "Missing payment details"
            });
        }

        const numAmount = Number(amount);

        if (isNaN(numAmount) || numAmount < 100) {
            return res.status(400).json({
                success: false,
                message: MESSAGES.USER_MINIMUM_WALLET_TOPUP_AMOUNT
            });
        }

        if (numAmount > 50000) {
            return res.status(400).json({
                success: false,
                message: MESSAGES.USER_MAXIMUM_WALLET_TOPUP_AMOUNT
            });
        }

       
        const body = `${razorpay_order_id}|${razorpay_payment_id}`;

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: MESSAGES.ORDER_PAYMENT_VERIFICATION_FAILED
            });
        }

    
        const existingTransaction = await WalletTransaction.findOne({
            transactionId: razorpay_payment_id
        });

        if (existingTransaction) {
            return res.status(400).json({
                success: false,
                message: "Payment already processed"
            });
        }

        
        const user = await User.findOne({email: req.session.user});

        if (!user) {
            return res.status(404).json({
                success: false,
                message: MESSAGES.USER_NOT_FOUND
            });
        }

        
        await creditWallet({
            userId: user._id,
            amount: Number(amount),
            source: "wallet_topup",
            transactionId: razorpay_payment_id,
            description: "Wallet Top-up"
        });

        return res.json({
            success: true,
            message: "Wallet credited successfully"
        });

    } catch (error) {


        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        });

    }
};