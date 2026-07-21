// Get Effective Price
export const getEffectivePrice = (product, category = null) => {
    const basePriceToUse = product.merchantDiscountPrice || product.discountPrice || product.basePrice;
    const now = new Date();

    let productOfferActive = false;
    let productOfferDiscount = 0;
    let productOfferPrice = basePriceToUse;

    if (product.offer && product.offer.discountValue) {
        const { startDate, endDate, discountValue, discountType } = product.offer;
        const startOk = !startDate || new Date(startDate) <= now;
        const endOk = !endDate || new Date(endDate) >= now;
        if (startOk && endOk) {
            productOfferActive = true;
            if (discountType === "percentage") {
                productOfferDiscount = basePriceToUse * (discountValue / 100);
            } else if (discountType === "flat") {
                productOfferDiscount = discountValue;
            }
            productOfferPrice = Math.max(0, basePriceToUse - productOfferDiscount);
        }
    }

    let categoryOfferActive = false;
    let categoryOfferDiscount = 0;
    let categoryOfferPrice = basePriceToUse;

    const catObj = category || product.category;
    if (catObj && catObj.offer && catObj.offer.discountValue) {
        const { startDate, endDate, discountValue, discountType } = catObj.offer;
        const startOk = !startDate || new Date(startDate) <= now;
        const endOk = !endDate || new Date(endDate) >= now;
        if (startOk && endOk) {
            categoryOfferActive = true;
            if (discountType === "percentage") {
                categoryOfferDiscount = basePriceToUse * (discountValue / 100);
            } else if (discountType === "flat") {
                categoryOfferDiscount = discountValue;
            }
            categoryOfferPrice = Math.max(0, basePriceToUse - categoryOfferDiscount);
        }
    }

    let finalPrice = basePriceToUse;
    let offerSource = null;
    let offerName = "";
    let offerDiscountValue = 0;
    let offerDiscountType = "percentage";

    if (productOfferActive && categoryOfferActive) {
        if (productOfferDiscount >= categoryOfferDiscount) {
            finalPrice = productOfferPrice;
            offerSource = "product";
            offerName = product.offer.name;
            offerDiscountValue = product.offer.discountValue;
            offerDiscountType = product.offer.discountType;
        } else {
            finalPrice = categoryOfferPrice;
            offerSource = "category";
            offerName = catObj.offer.name;
            offerDiscountValue = catObj.offer.discountValue;
            offerDiscountType = catObj.offer.discountType;
        }
    } else if (productOfferActive) {
        finalPrice = productOfferPrice;
        offerSource = "product";
        offerName = product.offer.name;
        offerDiscountValue = product.offer.discountValue;
        offerDiscountType = product.offer.discountType;
    } else if (categoryOfferActive) {
        finalPrice = categoryOfferPrice;
        offerSource = "category";
        offerName = catObj.offer.name;
        offerDiscountValue = catObj.offer.discountValue;
        offerDiscountType = catObj.offer.discountType;
    }

    return {
        price: Math.round(finalPrice * 100) / 100,
        offerActive: productOfferActive || categoryOfferActive,
        offerSource,
        offerName,
        offerDiscountValue,
        offerDiscountType,
        originalPrice: basePriceToUse
    };
};
