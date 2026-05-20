import Order from "../../model/orderSchema.js";
import Address from "../../model/addressSchema.js";
import Cart from "../../model/cartSchema.js";
import Product from "../../model/productSchema.js";
import {User} from "../../model/userSchema.js";  

const checkCartAvailability = (cart) => {
    if (!cart || cart.items.length === 0) return false;
    for (const item of cart.items) {
        const product = item.productId;
        if (!product || !product.isListed) return false;
        const variant = product.variants ? product.variants.id(item.variantId) : null;
        if (!variant || !variant.isActive || variant.stock < item.qty) return false;
    }
    return true;
};

export const loadCheckoutAddress = async (req, res) => {
    try {
        const userEmail = req.session.user;
        if (!userEmail) return res.redirect("/login");

        const user = await User.findOne({ email: userEmail });
        if (!user) return res.redirect("/login");

        const addresses = await Address.find({ 
            user: user._id, 
            isDelete: false 
        }).sort({ isDefault: -1, createdAt: -1 });

        const cart = await Cart.findOne({ userId: user._id })
                              .populate("items.productId");

        if (!checkCartAvailability(cart)) {
            return res.redirect("/cart?error=unavailable");
        }

        res.render("user/checkout/checkoutAddress", {
            addresses,
            cart,
            user
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};

export const loadCheckoutPayment = async (req, res) => {
    try {
        const userEmail = req.session.user;
        if (!userEmail) return res.redirect("/login");

        const user = await User.findOne({ email: userEmail });
        if (!user) return res.redirect("/login");

        const cart = await Cart.findOne({ userId: user._id })
                              .populate("items.productId");

        if (!checkCartAvailability(cart)) {
            return res.redirect("/cart?error=unavailable");
        }

        res.render("user/checkout/checkoutPayment", { cart, user });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};

export const loadCheckoutReview = async (req, res) => {
    try {
        const userEmail = req.session.user;
        if (!userEmail) return res.redirect("/login");

        const user = await User.findOne({ email: userEmail });
        if (!user) return res.redirect("/login");

        const cart = await Cart.findOne({ userId: user._id })
                              .populate("items.productId");

        if (!checkCartAvailability(cart)) {
            return res.redirect("/cart?error=unavailable");
        }

        const address = await Address.findOne({ 
            _id: req.query.addressId, 
            user: user._id 
        });

        if (!cart || !address) {
            return res.redirect("/checkout/address");
        }

        res.render("user/checkout/checkoutReview", {
            cart,
            address,
            user,
            paymentMethod: req.query.paymentMethod || "cod"
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};


export const placeOrder = async (req, res) => {
    try {
        const userEmail = req.session.user;
        if (!userEmail) {
            return res.status(401).json({ success: false, message: "Please login" });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        const userId = user._id;

        const { addressId, paymentMethod = "cod" } = req.body;

        const address = await Address.findOne({ _id: addressId, user: userId });
        if (!address) {
            return res.status(400).json({ success: false, message: "Address not found" });
        }

        const cart = await Cart.findOne({ userId: userId }).populate("items.productId");
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty" });
        }

        let subtotal = 0;
        const orderItems = [];

        for (let item of cart.items) {
            const product = item.productId;
            if (!product) continue;

            const variant = product.variants.id(item.variantId);
            const variantStock = variant ? variant.stock : 0;

            if (variantStock < item.qty) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Insufficient stock for ${product.name}` 
                });
            }

            const price = product.discountPrice || product.basePrice;
            const total = price * item.qty;
            const productImage = variant && variant.images && variant.images.length > 0 
                                 ? variant.images[0].url : "";
            const variantName = variant ? variant.color : "";

            orderItems.push({
                productId: product._id,
                variantId: item.variantId,
                productName: product.name,
                variantName: variantName,
                productImage: productImage,
                qty: item.qty,
                price: price,
                total: total
            });

            subtotal += total;
        }

        const deliveryCharge = 0;
        const finalAmount = subtotal + deliveryCharge;

        const order = new Order({
            userId,
            items: orderItems,
            shippingAddress: {
                fullName: address.fullName,
                phone: address.phone,
                addressLine: address.addressLine,
                apartment: address.apartment || "",
                city: address.city,
                state: address.state,
                pincode: address.pincode,
                country: "India"
            },
            orderTotal: subtotal,
            deliveryCharge,
            discount: 0,
            finalAmount,
            paymentMethod,
            orderStatus: "pending",
            paymentStatus: paymentMethod === "cod" ? "pending" : "paid"
        });

        await order.save();

        // Reduce Stock
        for (let item of cart.items) {
            await Product.findOneAndUpdate(
                { "_id": item.productId, "variants._id": item.variantId },
                { $inc: { "variants.$.stock": -item.qty } }
            );
        }

        // Clear Cart
        await Cart.findOneAndDelete({ userId: userId });

        res.json({
            success: true,
            message: "Order placed successfully!",
            orderId: order.orderId || order._id,
            redirectUrl: `/order-confirmation?orderId=${order._id}`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to place order" });
    }
};
