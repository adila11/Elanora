import Cart from "../../model/cartSchema.js";
import Products from "../../model/productSchema.js";
import { User } from "../../model/userSchema.js";
import Wishlist from "../../model/wishlistSchema.js";
import { getEffectivePrice } from "../../utils/offerHelper.js";

export const addToCart = async (req, res) => {
    try {
        const userEmail = req.session.user;

        if (!userEmail) {
            return res.json({ success: false, message: "Please login first" });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.json({ success: false, message: "Please login first" });
        }

        const userId = user._id;
        const { productId, variantId, qty } = req.body;

        if (!qty || isNaN(qty) || qty < 1) {
            return res.json({ success: false, message: "Invalid quantity" });
        }

        const product = await Products.findById(productId).populate('category');
        if (!product || !product.isListed) {
            return res.json({ success: false, message: "Product is not available" });
        }

        const variant = product.variants.id(variantId);
        if (!variant || !variant.isActive) {
            return res.json({ success: false, message: "Variant is not available" });
        }

        let cart = await Cart.findOne({ userId });
        const currentTotalQty = cart ? cart.items.reduce((sum, item) => sum + item.qty, 0) : 0;

        if (currentTotalQty + qty > 10) {
            const remaining = Math.max(0, 10 - currentTotalQty);
            if (remaining === 0) {
                return res.json({ success: false, message: "Maximum cart quantity is 10." });
            }
            return res.json({ success: false, message: `You can only add ${remaining} more items to the cart.` });
        }




        let existingItemQty = 0;
        let itemIndex = -1;

        if (cart) {
            itemIndex = cart.items.findIndex(item =>
                item.productId.toString() === productId &&
                item.variantId.toString() === variantId
            );
            if (itemIndex > -1) {
                existingItemQty = cart.items[itemIndex].qty;
            }
        }

        if (existingItemQty + qty > 10) {
            return res.json({ success: false, message: "Maximum quantity per product is 10." });
        }

        if (existingItemQty + qty > variant.stock) {
            return res.json({ success: false, message: `Only ${variant.stock} quantity available.` });
        }

        const pricing = getEffectivePrice(product);
        const price = pricing.price;

        if (!cart) {
            cart = new Cart({
                userId,
                items: [{
                    productId,
                    variantId,
                    qty,
                    price,
                    total: price * qty
                }]
            });
        } else {
            if (itemIndex > -1) {
                const newQty = existingItemQty + qty;
                cart.items[itemIndex].qty = newQty;
                cart.items[itemIndex].total = newQty * cart.items[itemIndex].price;
            } else {
                cart.items.push({
                    productId,
                    variantId,
                    qty,
                    price,
                    total: price * qty
                });
            }
        }

        await cart.save();

        const cartCount = cart.items.reduce(
            (total, item) => total + item.qty,
            0
        );

        const wishlist = await Wishlist.findOne({ userId: userId });
        if (wishlist) {
            const initialLength = wishlist.products.length;
            wishlist.products = wishlist.products.filter(
                item => item.productId.toString() !== productId.toString()
            );
            if (wishlist.products.length < initialLength) {
                await wishlist.save();
            }
        }

        res.json({
            success: true,
            message: "Added to cart",
            cartCount
        });


    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const updateCartItem = async (req, res) => {
    try {
        const userEmail = req.session.user;

        if (!userEmail) {
            return res.json({ success: false, message: "Please login first" });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.json({ success: false, message: "Please login first" });
        }

        const userId = user._id;
        let { productId, variantId, qty } = req.body;

        if (!qty || isNaN(qty) || qty < 1) {
            return res.json({ success: false, message: "Quantity must be at least 1" });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.json({ success: false, message: "Cart not found" });
        }

        const itemIndex = cart.items.findIndex(item =>
            item.productId.toString() === productId &&
            item.variantId.toString() === variantId
        );

        if (itemIndex === -1) {
            return res.json({ success: false, message: "Item not found in cart" });
        }

        const otherItemsQty = cart.items.reduce((sum, item, idx) => {
            return idx === itemIndex ? sum : sum + item.qty;
        }, 0);

        if (otherItemsQty + qty > 10) {
            const allowedQty = Math.max(0, 10 - otherItemsQty);
            if (allowedQty === 0) {
                return res.json({ success: false, message: "Maximum cart quantity is 10." });
            }
            return res.json({ success: false, message: `You can only add ${allowedQty} more items to the cart.` });
        }

        if (qty > 10) {
            return res.json({ success: false, message: "Maximum quantity per product is 10." });
        }

        const product = await Products.findById(productId);
        if (!product || !product.isListed) {
            return res.json({ success: false, message: "Product is not available" });
        }

        const variant = product.variants.id(variantId);
        if (!variant || !variant.isActive) {
            return res.json({ success: false, message: "Variant is not available" });
        }

        let requestedQty = qty;
        if (variant.stock < qty) {
            qty = variant.stock;
        }

        cart.items[itemIndex].qty = qty;
        cart.items[itemIndex].total = cart.items[itemIndex].price * qty;

        await cart.save();

        let subtotal = 0;
        cart.items.forEach(item => {
            subtotal += item.total;
        });

        res.json({
            success: true,
            itemTotal: cart.items[itemIndex].total,
            subtotal,
            updatedQty: qty,
            message: requestedQty > variant.stock ? `Quantity auto-adjusted to available stock (${variant.stock}).` : "Cart updated"
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const removeCartItem = async (req, res) => {
    try {
        const userEmail = req.session.user;

        if (!userEmail) {
            return res.json({ success: false, message: "Please login first" });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.json({ success: false, message: "Please login first" });
        }

        const userId = user._id;
        const { productId, variantId } = req.body;

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.json({ success: false, message: "Cart not found" });
        }

        cart.items = cart.items.filter(item =>
            !(item.productId.toString() === productId &&
                item.variantId.toString() === variantId)
        );

        await cart.save();

        const cartCount = cart.items.reduce(
            (total, item) => total + item.qty,
            0
        );
        let subtotal = 0;
        cart.items.forEach(item => {
            subtotal += item.total;
        });

        res.json({
            success: true,
            subtotal,
            cartCount,
            message: "Item removed from cart"
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const loadCart = async (req, res) => {
    try {
        const userEmail = req.session.user;

        if (!userEmail) {
            return res.redirect("/login");
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.redirect("/login");
        }

        const userId = user._id;

        const cart = await Cart.findOne({ userId })
            .populate({
                path: "items.productId",
                populate: {
                    path: "category"
                }
            });

        let subtotal = 0;

        if (cart) {
            cart.items.forEach(item => {
                if (item.productId) {
                    const pricing = getEffectivePrice(item.productId);
                    item.price = pricing.price;
                    item.total = item.price * item.qty;
                }
                subtotal += item.total;
            });
        }

        res.render("user/cart", { cart, subtotal, title: "Shopping Cart" });

    } catch (error) {
        res.status(500).send("Server error");
    }
};