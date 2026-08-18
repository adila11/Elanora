import Coupon from "../../model/couponSchema.js";
import { MESSAGES } from '../../constants/messages.js';

const ALLOWED_DISCOUNT_TYPES = ["percentage", "fixed"];

const validateCouponInput = (payload = {}) => {

    const {
        couponCode,
        couponName,
        description,
        discountType,
        discountValue,
        minimumPurchase,
        maximumDiscount,
        startDate,
        expiryDate,
        usageLimit
    } = payload;

    const errors = {};
    const data = {};

    
    const rawCode =typeof couponCode === "string"? couponCode.trim(): "";

    if (!rawCode) {
        errors.couponCode = "Coupon code is required.";
    } else {

        const upperCode = rawCode.toUpperCase();

        if (!/^[A-Z0-9]+$/.test(upperCode)) {
            errors.couponCode ="Coupon code can only contain letters and numbers.";
        } else if (
            upperCode.length < 4 ||
            upperCode.length > 20
        ) {
            errors.couponCode ="Coupon code must be between 4 and 20 characters.";
        } else {
            data.couponCode = upperCode;
        }
    }

    
    const rawName = typeof couponName === "string"? couponName.trim(): "";

    if (!rawName) {

        errors.couponName = "Coupon name is required.";
    } else if (rawName.length < 3) {

        errors.couponName ="Coupon name must contain at least 3 characters.";
    } else if (rawName.length > 50) {

        errors.couponName ="Coupon name cannot exceed 50 characters.";
    } else { 
        data.couponName = rawName;
    }

    

    const rawDescription =typeof description === "string"? description.trim(): "";

    if (rawDescription.length > 200) {

        errors.description ="Description cannot exceed 200 characters.";

    } else {

        data.description = rawDescription;

    }

   
    const rawType =typeof discountType === "string"? discountType.trim().toLowerCase(): "";

    if (!rawType) {

        errors.discountType ="Discount type is required.";

    } else if (
        !ALLOWED_DISCOUNT_TYPES.includes(rawType)
    ) {

        errors.discountType ="Discount type must be percentage or fixed.";

    } else {

        data.discountType = rawType;

    }

    
    if (discountValue === undefined ||discountValue === null || discountValue === "") {

        errors.discountValue = "Discount value is required.";

    } else {

        const value = Number(discountValue);

        if (Number.isNaN(value)) {

            errors.discountValue ="Discount value must be a valid number.";

        } else if (value <= 0) {

            errors.discountValue ="Discount value must be greater than zero.";

        } else if (
            data.discountType === "percentage" &&
            value > 100
        ) {

            errors.discountValue ="Percentage discount cannot exceed 100%.";

        } else {

            data.discountValue = value;

        }

    }

    

    if (minimumPurchase === undefined ||minimumPurchase === null || minimumPurchase === "" ) {

        errors.minimumPurchase ="Minimum purchase is required.";

    } else {

        const value = Number(minimumPurchase);

        if (Number.isNaN(value)) {

            errors.minimumPurchase ="Minimum purchase must be a valid number.";

        } else if (value < 0) {

            errors.minimumPurchase ="Minimum purchase cannot be negative.";

        } else {

            data.minimumPurchase = value;

        }

    }

   
    if (data.discountType === "percentage") {

        if (maximumDiscount === undefined ||maximumDiscount === null ||maximumDiscount === "") {

            errors.maximumDiscount ="Maximum discount is required.";

        } else {

            const value = Number(maximumDiscount);

            if (Number.isNaN(value)) {

                errors.maximumDiscount ="Maximum discount must be a valid number.";

            } else if (value <= 0) {

                errors.maximumDiscount ="Maximum discount must be greater than zero.";

            } else {

                data.maximumDiscount = value;

            }

        }

    } else if (data.discountType === "fixed") {

        data.maximumDiscount = 0;

    }

   
    const parsedStart = new Date(startDate);
    const parsedExpiry = new Date(expiryDate);

    const isStartValid =Boolean(startDate) &&!Number.isNaN(parsedStart.getTime());

    const isExpiryValid =Boolean(expiryDate) &&!Number.isNaN(parsedExpiry.getTime());

    if (!startDate) {

        errors.startDate ="Start date is required.";

    } else if (!isStartValid) {

        errors.startDate ="Start date is invalid.";

    } else {

        data.startDate = parsedStart;

    }

    if (!expiryDate) {

        errors.expiryDate ="Expiry date is required.";

    } else if (!isExpiryValid) {

        errors.expiryDate ="Expiry date is invalid.";

    } else {

        data.expiryDate = parsedExpiry;

    }

    if (isStartValid &&isExpiryValid && parsedExpiry <= parsedStart) {

        errors.expiryDate ="Expiry date must be after the start date.";

    }

    

    if (usageLimit === undefined ||usageLimit === null ||usageLimit === "" ) {

        data.usageLimit = null;

    } else {

        const value = Number(usageLimit);

        if (!Number.isInteger(value)) {

            errors.usageLimit ="Usage limit must be a whole number.";

        } else if (value < 1) {

            errors.usageLimit ="Usage limit must be at least 1.";

        } else {

            data.usageLimit = value;

        }

    }

    return {
        isValid:Object.keys(errors).length === 0,
        errors,
        data

    };

};


const isCouponCodeTaken = async (couponCode,excludeId = null) => {

    const query = { couponCode };

    if (excludeId) {

        query._id = {
            $ne: excludeId
        };

    }

    const existingCoupon = await Coupon.findOne(query);

    return Boolean(existingCoupon);

};



export const loadCoupons = async (req, res) => {

    try {
        const search = req.query.search || "";
        const status = req.query.status || "all";

        let query = {};

        if (search) {

            query.$or = [
                {
                    couponCode: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    couponName: {
                        $regex: search,
                        $options: "i"
                    }
                }
            ];

        }

        if (status === "active") {
            query.isActive = true;
            query.expiryDate = {
                $gte: new Date()
            };

        }

        if (status === "inactive") {
            query.isActive = false;

        }

        if (status === "expired") {
            query.expiryDate = {
                $lt: new Date()
            };

        }

        const coupons = await Coupon
            .find(query)
            .sort({ createdAt: -1 });

        return res.render("admin/coupon", {
            title: "Coupon",
            coupons,
            search,
            status
        });

    } catch (error) {
        return res.status(500).render("admin/coupon", {
            title: "Coupon",
            coupons: [],
            search: "",
            status: "all"
        });
    }
};




export const createCoupon = async (req, res) => {

    try {
        const { isValid, errors,data} = validateCouponInput(req.body);

        if (!isValid) {

            return res.status(400).json({
                success: false,
                message:MESSAGES.OTHER_PLEASE_CORRECT_VALIDATION_ERRORS,
                errors
            });
        }


        const alreadyExists =await isCouponCodeTaken(data.couponCode);

        if (alreadyExists) {
            return res.status(409).json({
                success: false,
                message:MESSAGES.COUPON_CODE_ALREADY_EXISTS,
                errors: {
                    couponCode: "This coupon code is already in use."
                }
            });

        }



        await Coupon.create({
            couponCode: data.couponCode,
            couponName: data.couponName,
            description: data.description,
            discountType: data.discountType,
            discountValue: data.discountValue,
            minimumPurchase: data.minimumPurchase,
            maximumDiscount: data.maximumDiscount,
            startDate: data.startDate,
            expiryDate: data.expiryDate,
            usageLimit: data.usageLimit,
            isActive: Boolean(req.body.isActive)

        });

        return res.status(201).json({
            success: true,
            message: "Coupon created successfully."
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message:"Something went wrong while creating the coupon."
        });

    }

};




export const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            isValid,
            errors,
            data
        } = validateCouponInput(req.body);

        if (!isValid) {
            return res.status(400).json({
                  success: false,
                   message:MESSAGES.OTHER_PLEASE_CORRECT_VALIDATION_ERRORS,
                   errors
            });
        }



        const alreadyExists = await isCouponCodeTaken(data.couponCode,id);

        if (alreadyExists) {
            return res.status(409).json({
                success: false,
                message:MESSAGES.COUPON_CODE_ALREADY_EXISTS,
                errors: {
                    couponCode:"This coupon code is already in use."
                }
            });
        }


        const updatedCoupon =await Coupon.findByIdAndUpdate(id, {
                    couponCode: data.couponCode,
                    couponName: data.couponName,
                    description: data.description,
                    discountType: data.discountType,
                    discountValue: data.discountValue,
                    minimumPurchase: data.minimumPurchase,
                    maximumDiscount: data.maximumDiscount,
                    startDate: data.startDate,
                    expiryDate: data.expiryDate,
                    usageLimit: data.usageLimit,
                    isActive: Boolean(req.body.isActive)
                },

                { new: true,runValidators: true}

            );

        if (!updatedCoupon) {
            return res.status(404).json({
                success: false,
                message: MESSAGES.COUPON_NOT_FOUND
            });

        }

        return res.status(200).json({
            success: true,
            message: "Coupon updated successfully."
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message:"Something went wrong while updating the coupon."
        });
    }
};




export const deleteCoupon = async (req, res) => {

    try {
        const deletedCoupon =
            await Coupon.findByIdAndDelete(
                req.params.id
            );

        if (!deletedCoupon) {
            return res.status(404).json({
                success: false,
                message: MESSAGES.COUPON_NOT_FOUND
            });
        }
        return res.status(200).json({
            success: true,
            message: "Coupon deleted successfully."
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Something went wrong while deleting the coupon."
        });
    }
};