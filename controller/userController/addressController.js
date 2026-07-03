import { User } from "../../model/userSchema.js"
import Address from "../../model/addressSchema.js";

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
        console.error("Load Address Error:", error);
        res.status(500).send("Server error");
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
        console.error("Load Address Error:", error);
        res.status(500).send("Server error");
    }
}
export const addAddress = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) {
            return res.status(401).json({ message: "Unauthorized. Please login." });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "User not found" });
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
            errors.push("Address type is required");
        }

        if (!fullName || fullName.trim().length < 3) {
            errors.push("Full name must be at least 3 characters");
        }

        if (!phone || !/^[6-9]\d{9}$/.test(phone.trim())) {
            errors.push("Valid 10-digit Indian phone number is required");
        }

        if (!addressLine || addressLine.trim().length < 10) {
            errors.push("Address line must be at least 10 characters");
        }

        if (!city || city.trim().length < 2) {
            errors.push("City is required");
        }

        if (!district || district.trim().length < 2) {
            errors.push("District is required");
        }

        if (!state || state.trim().length < 2) {
            errors.push("State is required");
        }

        if (!pincode || !/^\d{6}$/.test(pincode.trim())) {
            errors.push("Valid 6-digit pincode is required");
        }

        if (errors.length > 0) {
            return res.status(400).json({ 
                message: "Validation failed", 
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
        console.error("Add Address Error:", error);
        res.status(500).json({ 
            message: "Something went wrong. Please try again later." 
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
        if (!id) return res.redirect('/addresses');

        const address = await Address.findById(id);
        if (!address) return res.redirect('/addresses');

        res.render("user/address/edit-address", { user, address });
    } catch (error) {
        console.error("Load Address Error:", error);
        res.status(500).send("Server error");
    }
}


export const editAddress = async (req, res) => {
    try {
        const email = req.session.user;
        if (!email) {
            return res.status(401).json({ message: "Unauthorized. Please login." });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "User not found" });
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
            return res.status(404).json({ message: "Address not found" });
        }

        const errors = [];

        if (!type || type.trim() === "") {
            errors.push("Address type is required");
        }

        if (!fullName || fullName.trim().length < 3) {
            errors.push("Full name must be at least 3 characters");
        }

        if (!phone || !/^[6-9]\d{9}$/.test(phone.trim())) {
            errors.push("Valid 10-digit Indian phone number is required");
        }

        if (!addressLine || addressLine.trim().length < 10) {
            errors.push("Address line must be at least 10 characters");
        }

        if (!city || city.trim().length < 2) {
            errors.push("City is required");
        }

        if (!district || district.trim().length < 2) {
            errors.push("District is required");
        }

        if (!state || state.trim().length < 2) {
            errors.push("State is required");
        }

        if (!pincode || !/^\d{6}$/.test(pincode.trim())) {
            errors.push("Valid 6-digit pincode is required");
        }

        if (errors.length > 0) {
            return res.status(400).json({ 
                message: "Validation failed", 
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
        console.error("Edit Address Error:", error);
        res.status(500).json({ 
            message: "Something went wrong. Please try again later." 
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
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
}


export const deleteAddress = async (req, res) => {
    try {
        console.log("flag")
        const email = req.session.user;
        if (!email) return res.status(401).json({ message: "Please login" });

        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ message: "User not found" });

        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "Invalid address ID" });
        }

        const address = await Address.findOne({ 
            _id: id, 
            user: user._id   
        });

        if (!address) {
            return res.status(404).json({ message: "Address not found" });
        }

        address.isDelete = true;
        await address.save();

        return res.json({ 
            message: "Address deleted successfully",
            success: true 
        });

    } catch (error) {
        console.error("Delete Address Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};