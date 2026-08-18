import { User } from "../../model/userSchema.js"
import Address from "../../model/addressSchema.js";
import { MESSAGES } from '../../constants/messages.js';

export const loadAddress = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) return res.redirect("/login");

        const user = await User.findOne({ email: email });
        if (!user) return res.redirect("/login");

        const addresses = await Address.find({
            user: user._id,
            isDelete: false
        }).sort({ isDefault: -1, createdAt: -1 });   

        res.render("user/address/address", {
            user,
            addresses
        });
    } catch (error) {
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};



export const loadAddAddress = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) return res.redirect("/login");

        const user = await User.findOne({ email: email });
        if (!user) return res.redirect("/login");
        res.render("user/address/add-address", { user });
    } catch (error) {
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
}
export const addAddress = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) {
            return res.status(401).json({ message: MESSAGES.AUTH_UNAUTHORIZED_PLEASE_LOGIN });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: MESSAGES.USER_NOT_FOUND });
        }

        const { 
            type, 
            fullName, 
            phone, 
            addressLine, 
            city, 
            district,
            state, 
            pincode,
            isDefault
        } = req.body;

        const errors = [];

        if (!type || type.trim() === "") {
            errors.push(MESSAGES.VALIDATION_ADDRESS_TYPE_REQUIRED);
        }

        if (!fullName || fullName.trim().length < 3) {
            errors.push(MESSAGES.VALIDATION_FULL_NAME_MUST_AT);
        } else if (fullName.trim().length > 40) {
            errors.push(MESSAGES.VALIDATION_FULL_NAME_CANNOT_EXCEED);
        } else if (!/^[A-Za-z\s]+$/.test(fullName.trim())) {
            errors.push(MESSAGES.OTHER_FULL_NAME_MUST_CONTAIN);
        }

        if (!phone || !/^[6-9]\d{9}$/.test(phone.trim())) {
            errors.push(MESSAGES.VALIDATION_VALID_10DIGIT_INDIAN_PHONE);
        }

        if (!addressLine || addressLine.trim().length < 10) {
            errors.push(MESSAGES.VALIDATION_ADDRESS_LINE_MUST_AT);
        } else if (addressLine.trim().length > 100) {
            errors.push(MESSAGES.VALIDATION_ADDRESS_LINE_CANNOT_EXCEED);
        }

        if (!city || city.trim().length < 2) {
            errors.push(MESSAGES.VALIDATION_CITY_REQUIRED);
        } else if (city.trim().length > 20) {
            errors.push(MESSAGES.VALIDATION_CITY_CANNOT_EXCEED_20);
        } else if (!/^[A-Za-z\s]+$/.test(city.trim())) {
            errors.push(MESSAGES.VALIDATION_CITY_MUST_CONTAIN_ONLY);
        }

        if (!district || district.trim().length < 2) {
            errors.push(MESSAGES.VALIDATION_DISTRICT_REQUIRED);
        }

        if (!state || state.trim().length < 2) {
            errors.push(MESSAGES.VALIDATION_STATE_REQUIRED);
        }

        if (!pincode || !/^\d{6}$/.test(pincode.trim())) {
            errors.push(MESSAGES.VALIDATION_VALID_6DIGIT_PINCODE_REQUIRED);
        }

        if (errors.length > 0) {
            return res.status(400).json({ 
                message: MESSAGES.OTHER_VALIDATION_FAILED, 
                errors 
            });
        }

        const addressCount = await Address.countDocuments({ 
            user: user._id, 
            isDelete: false 
        });

        if (addressCount >= 5) {
            return res.status(400).json({ 
                message: "You can save a maximum of 5 addresses only." 
            });
        }

        let setAsDefault = isDefault === true || isDefault === "true";
        if (addressCount === 0) {
            setAsDefault = true;
        }

        if (setAsDefault) {
            await Address.updateMany({ user: user._id }, { $set: { isDefault: false } });
        }

        const newAddress = new Address({
            user: user._id,
            type: type.trim(),
            fullName: fullName.trim(),
            phone: phone.trim(),
            addressLine: addressLine.trim(),
            city: city.trim(),
            district: district.trim(),
            state: state.trim(),
            pincode: pincode.trim(),
            isDefault: setAsDefault,
            isDelete: false
        });

        await newAddress.save();

        res.status(201).json({ 
            message: "Address added successfully!", 
            address: newAddress 
        });

    } catch (error) {
        res.status(500).json({ 
            message: MESSAGES.SERVER_SOMETHING_WENT_WRONG_PLEASE 
        });
    }
};



export const loadEditAddress = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) return res.redirect("/login");

        const user = await User.findOne({ email: email });
        if (!user) return res.redirect("/login");

        const { id } = req.params;
        if (!id) return res.status(404).render("user/profile/pageNotFound");

        const address = await Address.findById(id);
        if (!address) return res.status(404).render("user/profile/pageNotFound");

        res.render("user/address/edit-address", { user, address });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(404).render("user/profile/pageNotFound");
        }
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
}


export const editAddress = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) {
            return res.status(401).json({ message: MESSAGES.AUTH_UNAUTHORIZED_PLEASE_LOGIN });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: MESSAGES.USER_NOT_FOUND });
        }

        const { id } = req.params;
        const { 
            type, 
            fullName, 
            phone, 
            addressLine, 
            city, 
            district,
            state, 
            pincode,
            isDefault
        } = req.body;

        const address = await Address.findOne({
            _id: id,
            user: user._id,
            isDelete: false
        });

        if (!address) {
            return res.status(404).json({ message: MESSAGES.USER_ADDRESS_NOT_FOUND });
        }

        const errors = [];

        if (!type || type.trim() === "") {
            errors.push(MESSAGES.VALIDATION_ADDRESS_TYPE_REQUIRED);
        }

        if (!fullName || fullName.trim().length < 3) {
            errors.push(MESSAGES.VALIDATION_FULL_NAME_MUST_AT);
        } else if (fullName.trim().length > 40) {
            errors.push(MESSAGES.VALIDATION_FULL_NAME_CANNOT_EXCEED);
        } else if (!/^[A-Za-z\s]+$/.test(fullName.trim())) {
            errors.push(MESSAGES.OTHER_FULL_NAME_MUST_CONTAIN);
        }

        if (!phone || !/^[6-9]\d{9}$/.test(phone.trim())) {
            errors.push(MESSAGES.VALIDATION_VALID_10DIGIT_INDIAN_PHONE);
        }

        if (!addressLine || addressLine.trim().length < 10) {
            errors.push(MESSAGES.VALIDATION_ADDRESS_LINE_MUST_AT);
        } else if (addressLine.trim().length > 100) {
            errors.push(MESSAGES.VALIDATION_ADDRESS_LINE_CANNOT_EXCEED);
        }

        if (!city || city.trim().length < 2) {
            errors.push(MESSAGES.VALIDATION_CITY_REQUIRED);
        } else if (city.trim().length > 20) {
            errors.push(MESSAGES.VALIDATION_CITY_CANNOT_EXCEED_20);
        } else if (!/^[A-Za-z\s]+$/.test(city.trim())) {
            errors.push(MESSAGES.VALIDATION_CITY_MUST_CONTAIN_ONLY);
        }

        if (!district || district.trim().length < 2) {
            errors.push(MESSAGES.VALIDATION_DISTRICT_REQUIRED);
        }

        if (!state || state.trim().length < 2) {
            errors.push(MESSAGES.VALIDATION_STATE_REQUIRED);
        }

        if (!pincode || !/^\d{6}$/.test(pincode.trim())) {
            errors.push(MESSAGES.VALIDATION_VALID_6DIGIT_PINCODE_REQUIRED);
        }

        if (errors.length > 0) {
            return res.status(400).json({ 
                message: MESSAGES.OTHER_VALIDATION_FAILED, 
                errors 
            });
        }

        address.type = type.trim();
        address.fullName = fullName.trim();
        address.phone = phone.trim();
        address.addressLine = addressLine.trim();
        address.city = city.trim();
        address.district = district.trim();
        address.state = state.trim();
        address.pincode = pincode.trim();

        let setAsDefault = isDefault === true || isDefault === "true";
        if (setAsDefault) {
            await Address.updateMany({ user: user._id, _id: { $ne: address._id } }, { $set: { isDefault: false } });
            address.isDefault = true;
        } else {
            address.isDefault = false;
        }

        await address.save();

        res.json({
            message: "Address updated successfully",
            address
        });

    } catch (error) {
        res.status(500).json({ 
            message: MESSAGES.SERVER_SOMETHING_WENT_WRONG_PLEASE 
        });
    }
};


export const setDefault = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) return res.redirect("/login");

        const user = await User.findOne({ email: email });
        if (!user) return res.redirect("/login");

        const { id } = req.params;
        if (!id) return res.redirect('/addresses');

        const address = await Address.findById(id);
        if (!address) return res.redirect('/addresses');

        await Address.updateMany(
            { user: user._id, isDelete: false },
            { isDefault: false }
        );

        await Address.findByIdAndUpdate(id, { isDefault: true });

        res.status(201).json({ message: "Default Address Has Been. Updated  " }); req.flash('Success', "Default address updated")
    } catch (error) {
        res.status(500).json({ message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
    }
}


export const deleteAddress = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) return res.status(401).json({ message: MESSAGES.AUTH_PLEASE_LOGIN });

        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ message: MESSAGES.USER_NOT_FOUND });

        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "Invalid address ID" });
        }

        const address = await Address.findOne({ 
            _id: id, 
            user: user._id   
        });

        if (!address) {
            return res.status(404).json({ message: MESSAGES.USER_ADDRESS_NOT_FOUND });
        }

        address.isDelete = true;
        await address.save();

        return res.json({ 
            message: "Address deleted successfully",
            success: true 
        });

    } catch (error) {
        res.status(500).json({ message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
    }
};