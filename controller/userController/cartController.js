import Cart from "../../model/cartSchema.js";
import Products from "../../model/productSchema.js";
import { User } from "../../model/userSchema.js";
import Wishlist from "../../model/wishlistSchema.js";
import { getEffectivePrice } from "../../utils/offerHelper.js";
import { MESSAGES } from '../../constants/messages.js';

export const addToCart = async (req, res) => {
    try {
        const userEmail = req.session.user;

        if (!userEmail) {
            return res.json({ success: false, message: MESSAGES.AUTH_PLEASE_LOGIN_FIRST });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.json({ success: false, message: MESSAGES.AUTH_PLEASE_LOGIN_FIRST });
        }

        const userId = user._id;
        const { productId, variantId, qty } = req.body;

        const quantity = parseInt(qty, 10);
        if (isNaN(quantity) || quantity < 1) {
            return res.json({ success: false, message: "Invalid quantity" });
        }

        const product = await Products.findById(productId).populate('category');
        if (!product || !product.isListed) {
            return res.json({ success: false, message: MESSAGES.PRODUCT_NOT_AVAILABLE });
        }

        const variant = product.variants ? product.variants.id(variantId) : null;
        if (!variant || !variant.isActive) {
            return res.json({ success: false, message: MESSAGES.PRODUCT_VARIANT_NOT_AVAILABLE });
        }

        let cart = await Cart.findOne({ userId });

        let existingItemQty = 0;
        let itemIndex = -1;

        if (cart) {
            itemIndex = cart.items.findIndex(item =>
                item.productId.toString() === productId &&
                item.variantId.toString() === variantId
            );
            if (itemIndex > -1) {
                existingItemQty = Number(cart.items[itemIndex].qty);
            }
        }

        const currentTotalQty = cart ? cart.items.reduce((sum, item) => sum + Number(item.qty), 0) : 0;
        const otherCartItemsQty = currentTotalQty - existingItemQty;
        const newTotalProductQty = existingItemQty + quantity;
        const newTotalCartQty = otherCartItemsQty + newTotalProductQty;

        if (newTotalCartQty > 10) {
            const remaining = Math.max(0, 10 - currentTotalQty);
            if (remaining === 0) {
                return res.json({ success: false, message: MESSAGES.CART_MAXIMUM_CART_QUANTITY_10 });
            }
            return res.json({ success: false, message: MESSAGES.YOU_CAN_ONLY_ADD_DYNAMIC_MORE_ITEMS_TO_THE_CART_1(remaining) });
        }

        if (newTotalProductQty > 10) {
            return res.json({ success: false, message: MESSAGES.CART_MAXIMUM_QUANTITY_PER_PRODUCT });
        }

        if (newTotalProductQty > variant.stock) {
            const remainingStockCanAdd = variant.stock - existingItemQty;
            if (remainingStockCanAdd <= 0) {
                return res.json({ success: false, message: MESSAGES.MAXIMUM_AVAILABLE_STOCK_DYNAMIC_IS_ALREADY_IN_YOUR_CART(variant) });
            }
            return res.json({ success: false, message: MESSAGES.ONLY_DYNAMIC_MORE_UNITS_AVAILABLE_IN_STOCK(remainingStockCanAdd) });
        }

        const pricing = getEffectivePrice(product);
        const price = pricing.price;

        if (!cart) {
            cart = new Cart({
                userId,
                items: [{
                    productId,
                    variantId,
                    qty: quantity,
                    price,
                    total: price * quantity
                }]
            });
        } else {
            if (itemIndex > -1) {
                cart.items[itemIndex].qty = newTotalProductQty;
                cart.items[itemIndex].price = price;
                cart.items[itemIndex].total = newTotalProductQty * price;
            } else {
                cart.items.push({
                    productId,
                    variantId,
                    qty: quantity,
                    price,
                    total: price * quantity
                });
            }
        }

        await cart.save();

        const cartCount = cart.items.reduce(
            (total, item) => total + Number(item.qty),
            0
        );

        const wishlist = await Wishlist.findOne({ userId: userId });
        if (wishlist) {
            const initialLength = wishlist.products.length;
            wishlist.products = wishlist.products.filter(
                item => item.productId && item.productId.toString() !== productId.toString()
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
        res.status(500).json({ success: false, message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
    }
};

export const updateCartItem = async (req, res) => {
    try {
        const userEmail = req.session.user;

        if (!userEmail) {
            return res.json({ success: false, message: MESSAGES.AUTH_PLEASE_LOGIN_FIRST });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.json({ success: false, message: MESSAGES.AUTH_PLEASE_LOGIN_FIRST });
        }

        const userId = user._id;
        let { productId, variantId, qty } = req.body;

        const quantity = parseInt(qty, 10);
        if (isNaN(quantity) || quantity < 1) {
            return res.json({ success: false, message: "Quantity must be at least 1" });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.json({ success: false, message: MESSAGES.CART_NOT_FOUND });
        }

        const itemIndex = cart.items.findIndex(item =>
            item.productId.toString() === productId &&
            item.variantId.toString() === variantId
        );

        if (itemIndex === -1) {
            return res.json({ success: false, message: "Item not found in cart" });
        }

        const otherItemsQty = cart.items.reduce((sum, item, idx) => {
            return idx === itemIndex ? sum : sum + Number(item.qty);
        }, 0);

        if (otherItemsQty + quantity > 10) {
            const allowedQty = Math.max(0, 10 - otherItemsQty);
            if (allowedQty === 0) {
                return res.json({ success: false, message: MESSAGES.CART_MAXIMUM_CART_QUANTITY_10 });
            }
            return res.json({ success: false, message: MESSAGES.YOU_CAN_ONLY_ADD_DYNAMIC_MORE_ITEMS_TO_THE_CART(allowedQty) });
        }

        if (quantity > 10) {
            return res.json({ success: false, message: MESSAGES.CART_MAXIMUM_QUANTITY_PER_PRODUCT });
        }

        const product = await Products.findById(productId).populate('category');
        if (!product || !product.isListed) {
            return res.json({ success: false, message: MESSAGES.PRODUCT_NOT_AVAILABLE });
        }

        const variant = product.variants ? product.variants.id(variantId) : null;
        if (!variant || !variant.isActive) {
            return res.json({ success: false, message: MESSAGES.PRODUCT_VARIANT_NOT_AVAILABLE });
        }

        let finalQty = quantity;
        let message = "Cart updated";

        if (variant.stock < quantity) {
            finalQty = variant.stock;
            message = `Quantity auto-adjusted to available stock (${variant.stock}).`;
        }

        const pricing = getEffectivePrice(product);
        const price = pricing.price;

        cart.items[itemIndex].qty = finalQty;
        cart.items[itemIndex].price = price;
        cart.items[itemIndex].total = price * finalQty;

        await cart.save();

        let subtotal = 0;
        cart.items.forEach(item => {
            subtotal += item.total;
        });

        const cartCount = cart.items.reduce((total, item) => total + Number(item.qty), 0);

        res.json({
            success: true,
            itemTotal: cart.items[itemIndex].total,
            subtotal,
            updatedQty: finalQty,
            cartCount,
            message
        });

    } catch (error) {
        res.status(500).json({ success: false, message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
    }
};

export const removeCartItem = async (req, res) => {
    try {
        const userEmail = req.session.user;

        if (!userEmail) {
            return res.json({ success: false, message: MESSAGES.AUTH_PLEASE_LOGIN_FIRST });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.json({ success: false, message: MESSAGES.AUTH_PLEASE_LOGIN_FIRST });
        }

        const userId = user._id;
        const { productId, variantId } = req.body;

        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });
        if (!cart) {
            return res.json({ success: false, message: MESSAGES.CART_NOT_FOUND });
        }

        cart.items = cart.items.filter(item => {
            const pId = item.productId ? (item.productId._id ? item.productId._id.toString() : item.productId.toString()) : null;
            const vId = item.variantId ? item.variantId.toString() : null;
            return !(pId === productId && vId === variantId);
        });

        let subtotal = 0;
        cart.items.forEach(item => {
            if (item.productId) {
                const pricing = getEffectivePrice(item.productId);
                item.price = pricing.price;
                item.total = item.price * Number(item.qty);
                subtotal += item.total;
            }
        });

        await cart.save();

        const cartCount = cart.items.reduce(
            (total, item) => total + Number(item.qty),
            0
        );

        res.json({
            success: true,
            subtotal,
            cartCount,
            message: "Item removed from cart"
        });

    } catch (error) {
        res.status(500).json({ success: false, message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
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
        let hasChanges = false;

        if (cart) {
            const originalLength = cart.items.length;
            cart.items = cart.items.filter(item => item.productId != null);
            if (cart.items.length !== originalLength) {
                hasChanges = true;
            }

            cart.items.forEach(item => {
                if (item.productId) {
                    const pricing = getEffectivePrice(item.productId);
                    if (item.price !== pricing.price) {
                        hasChanges = true;
                    }
                    item.price = pricing.price;
                    item.total = item.price * Number(item.qty);
                    subtotal += item.total;
                }
            });

            if (hasChanges) {
                await cart.save();
            }
        }

        res.render("user/cart", { cart, subtotal, title: "Shopping Cart" });

    } catch (error) {
        res.status(500).send(MESSAGES.SERVER_INTERNAL_SERVER_ERROR);
    }
};