const generateReferralCode = (name) => {

    const random = Math.random()
        .toString(36)
        .substring(2,8)
        .toUpperCase();

    return `ELA${random}`;
}

export default generateReferralCode;