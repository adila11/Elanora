export function allocateCouponDiscount(items, coupon, totalDiscount) {
    if (!coupon || totalDiscount <= 0 || !items || items.length === 0) {
        for (const item of items) {
            item.couponDiscount = 0;
            item.couponDiscountLine = 0;
        }
        return items;
    }

    const applicability = coupon.applicability || "order_wide";

    const eligible = items.map((item) => {
        if (applicability === "product_specific") {
            return String(item.productId) === String(coupon.applicableProductId);
        }
        if (applicability === "category_specific") {
            const catId = item.category?._id
                ? String(item.category._id)
                : String(item.category ?? "");
            return catId === String(coupon.applicableCategoryId);
        }
        return true;
    });

    for (let i = 0; i < items.length; i++) {
        if (!eligible[i]) {
            items[i].couponDiscount = 0;
            items[i].couponDiscountLine = 0;
        }
    }

    const eligibleIndices = items.map((_, i) => i).filter((i) => eligible[i]);
    if (eligibleIndices.length === 0) return items;

    if (
        coupon.allocationStrategy === "count_split" &&
        coupon.discountType === "percentage"
    ) {
        _allocateCountSplit(items, totalDiscount, eligibleIndices);
        return items;
    }

    if (coupon.discountType === "percentage") {
        const eligibleSubtotal = eligibleIndices.reduce(
            (sum, i) => sum + items[i].price * items[i].qty,
            0
        );
        const uncapped = _round2(eligibleSubtotal * coupon.discountValue / 100);
        const isCapped = coupon.maximumDiscount > 0 && totalDiscount < uncapped;

        if (!isCapped) {
            _allocatePercentage(items, coupon, totalDiscount, eligibleIndices);
        } else {
            _allocateFlat(items, totalDiscount, eligibleIndices);
        }
        return items;
    }

    _allocateFlat(items, totalDiscount, eligibleIndices);
    return items;
}

function _allocateFlat(items, totalDiscount, eligibleIndices) {
    const eligibleSubtotal = eligibleIndices.reduce(
        (sum, i) => sum + items[i].price * items[i].qty,
        0
    );

    if (eligibleSubtotal === 0) {
        for (const i of eligibleIndices) {
            items[i].couponDiscount = 0;
            items[i].couponDiscountLine = 0;
        }
        return;
    }

    const totalPaise = Math.round(totalDiscount * 100);
    let allocatedPaise = 0;

    for (let k = 0; k < eligibleIndices.length; k++) {
        const i = eligibleIndices[k];
        const item = items[i];
        const lineTotal = item.price * item.qty;

        let linePaise;
        if (k === eligibleIndices.length - 1) {
            linePaise = totalPaise - allocatedPaise;
        } else {
            linePaise = Math.round((lineTotal / eligibleSubtotal) * totalPaise);
        }

        const maxLinePaise = Math.round(lineTotal * 100);
        linePaise = Math.min(linePaise, maxLinePaise);

        const couponDiscountLine = linePaise / 100;
        const couponDiscountPerUnit = _round2(couponDiscountLine / item.qty);

        items[i].couponDiscountLine = couponDiscountLine;
        items[i].couponDiscount = Math.min(couponDiscountPerUnit, item.price);

        allocatedPaise += linePaise;
    }
}

function _allocateCountSplit(items, totalDiscount, eligibleIndices) {
    const totalUnits = eligibleIndices.reduce((s, i) => s + items[i].qty, 0);
    if (totalUnits === 0) {
        for (const i of eligibleIndices) {
            items[i].couponDiscount = 0;
            items[i].couponDiscountLine = 0;
        }
        return;
    }

    const totalPaise = Math.round(totalDiscount * 100);
    const basePerUnitPaise = Math.floor(totalPaise / totalUnits);

    let allocatedPaise = 0;

    for (let k = 0; k < eligibleIndices.length; k++) {
        const i = eligibleIndices[k];
        const item = items[i];
        const isLast = k === eligibleIndices.length - 1;

        let linePaise;
        if (isLast) {
            linePaise = totalPaise - allocatedPaise;
        } else {
            linePaise = basePerUnitPaise * item.qty;
        }

        const maxLinePaise = Math.round(item.price * item.qty * 100);
        linePaise = Math.min(linePaise, maxLinePaise);

        const couponDiscountLine = linePaise / 100;
        const couponDiscountPerUnit = _round2(couponDiscountLine / item.qty);

        items[i].couponDiscountLine = couponDiscountLine;
        items[i].couponDiscount = Math.min(couponDiscountPerUnit, item.price);

        allocatedPaise += linePaise;
    }
}

function _allocatePercentage(items, coupon, totalDiscount, eligibleIndices) {
    const pct = coupon.discountValue / 100;
    const totalPaise = Math.round(totalDiscount * 100);
    let allocatedPaise = 0;

    for (let k = 0; k < eligibleIndices.length - 1; k++) {
        const i = eligibleIndices[k];
        const item = items[i];
        const perUnit = Math.min(_round2(item.price * pct), item.price);
        const linePaise = Math.round(perUnit * item.qty * 100);

        items[i].couponDiscount = perUnit;
        items[i].couponDiscountLine = linePaise / 100;
        allocatedPaise += linePaise;
    }

    const lastIdx = eligibleIndices[eligibleIndices.length - 1];
    const lastItem = items[lastIdx];
    const remainingPaise = totalPaise - allocatedPaise;
    const maxPaise = Math.round(lastItem.price * lastItem.qty * 100);
    const linePaise = Math.min(remainingPaise, maxPaise);

    items[lastIdx].couponDiscountLine = linePaise / 100;
    items[lastIdx].couponDiscount = Math.min(
        _round2((linePaise / 100) / lastItem.qty),
        lastItem.price
    );
}

function _round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
