import Wallet from "../model/walletSchema.js";
import WalletTransaction from "../model/walletTransactionSchema.js";


const generateTransactionId = () => {
    return `WLT${Date.now()}${Math.floor(Math.random() * 1000)}`;
};


// Get Or Create Wallet
export const getOrCreateWallet = async (userId) => {

    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
        wallet = await Wallet.create({
            userId,
            balance: 0
        });
    }

    return wallet;
};



// Credit Wallet
export const creditWallet = async ({
    userId,
    amount,
    source,
    orderId = null,
    transactionId = null,
    description = ""
}) => {

    const wallet = await getOrCreateWallet(userId);

    wallet.balance += amount;

    await wallet.save();

    await WalletTransaction.create({
        walletId: wallet._id,
        userId,
        transactionId: transactionId || generateTransactionId(),
        amount,
        type: "credit",
        source,
        orderId,
        status: "success",
        description
    });

    return wallet;
};



// Debit Wallet
export const debitWallet = async ({
    userId,
    amount,
    source,
    orderId = null,
    description = ""
}) => {

    const wallet = await getOrCreateWallet(userId);

    if (wallet.balance < amount) {
        throw new Error("Insufficient wallet balance");
    }

    wallet.balance -= amount;

    await wallet.save();

    await WalletTransaction.create({
        walletId: wallet._id,
        userId,
        transactionId: generateTransactionId(),
        amount,
        type: "debit",
        source,
        orderId,
        status: "success",
        description
    });

    return wallet;
};