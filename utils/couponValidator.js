import mongoose from "mongoose";
import Coupon from "../model/couponSchema.js";
import Product from "../model/productSchema.js";
import { creditWallet } from "./walletHelper.js";

export async function revalidateCouponAgainstCart(order, cancellingItemIds = []) {
  if (!order || !order.isCouponApplied || !order.couponCode) {
    return {
      isEligible: true,
      hasCoupon: false,
      couponCode: null,
      minCartValue: 0,
      remainingSubtotal: 0,
      reason: null,
    };
  }

  let minCartValue = 0;
  if (order.couponObj && typeof order.couponObj.minimumPurchase === "number") {
    minCartValue = order.couponObj.minimumPurchase;
  } else {
    try {
      const coupon = await Coupon.findOne({
        couponCode: order.couponCode.trim().toUpperCase(),
      }).lean();
      minCartValue = coupon ? coupon.minimumPurchase || 0 : 0;
    } catch {
      minCartValue = 0;
    }
  }

  if (minCartValue <= 0) {
    return {
      isEligible: true,
      hasCoupon: true,
      couponCode: order.couponCode,
      minCartValue: 0,
      remainingSubtotal: 0,
      reason: null,
    };
  }

  const cancelIdsStr = cancellingItemIds.map((id) => String(id));

  const remainingSubtotal = order.items.reduce((sum, item) => {
    const itemIdStr = item._id ? String(item._id) : String(item.productId);
    const isCancellingNow = cancelIdsStr.includes(itemIdStr) || cancelIdsStr.includes(String(item._id));
    const isAlreadyCancelledOrReturned =
      item.itemStatus === "cancelled" || item.itemStatus === "returned";

    if (!isCancellingNow && !isAlreadyCancelledOrReturned) {
      return sum + (item.total || item.price * item.qty || 0);
    }
    return sum;
  }, 0);

  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const remSub = round2(remainingSubtotal);

  const isEligible = remSub >= minCartValue;

  return {
    isEligible,
    hasCoupon: true,
    couponCode: order.couponCode,
    minCartValue,
    remainingSubtotal: remSub,
    reason: isEligible
      ? null
      : `Coupon minCartValue requirement breached: remaining subtotal ₹${remSub} < minimum ₹${minCartValue}.`,
  };
}


export async function cancelOrderDueToCouponBreach(order, validationResult, cancelReason = "", initiatedBy = "system") {
  const now = new Date();
  const breachMessage = `Coupon minimum purchase requirement breached (${order.couponCode}: min ₹${validationResult.minCartValue}, remaining ₹${validationResult.remainingSubtotal}). Entire order cancelled.`;

  console.log(`[AUDIT LOG - COUPON RE-VALIDATION BREACH]`, {
    timestamp: now.toISOString(),
    orderId: order.orderId,
    orderDbId: order._id,
    userId: order.userId,
    couponCode: order.couponCode,
    minCartValue: validationResult.minCartValue,
    remainingSubtotal: validationResult.remainingSubtotal,
    initiatedBy,
    action: "FULL_ORDER_CANCEL_AND_COUPON_REVERSAL",
  });

  let totalRefundForNewlyCancelled = 0;

  for (const item of order.items) {
    const isFinal = ["cancelled", "returned", "shipped", "out_for_delivery", "delivered"].includes(item.itemStatus);
    if (!isFinal) {
      item.itemStatus = "cancelled";
      item.cancelReason = breachMessage;
      item.cancelledAt = now;

      if (item.productId && item.variantId && mongoose.connection.readyState === 1) {
        await Product.findOneAndUpdate(
          { _id: item.productId, "variants._id": item.variantId },
          { $inc: { "variants.$.stock": item.qty } }
        ).catch(() => null);
      }

      const lineTotal = item.total || item.price * item.qty || 0;
      const lineDiscount = item.couponDiscountLine || 0;
      const netPaid = Math.max(0, lineTotal - lineDiscount);
      totalRefundForNewlyCancelled += netPaid;
    }
  }

  order.orderStatus = "cancelled";
  order.cancelReason = breachMessage;
  order.cancelledAt = now;

  if (order.paymentStatus === "paid" && totalRefundForNewlyCancelled > 0 && mongoose.connection.readyState === 1) {
    const roundRefund = Math.round(totalRefundForNewlyCancelled * 100) / 100;
    await creditWallet({
      userId: order.userId,
      amount: roundRefund,
      source: "order_cancel",
      orderId: order._id,
      description: `Refund for cancelled order ${order.orderId} (coupon minimum purchase breached)`,
    }).catch(() => null);
  }

  if (order.items.every((i) => i.itemStatus === "cancelled")) {
    order.paymentStatus = "refunded";
  }

  await order.save();

  return {
    cancelledOrder: true,
    message: breachMessage,
    refundAmount: totalRefundForNewlyCancelled,
  };
}
