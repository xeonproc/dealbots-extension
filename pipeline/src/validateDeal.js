// Prices are integers cents before the percent is rounded, so the figure
// stored in the feed is the same figure the popup and this check recompute.
export function discountPctFromPrices(price, listPrice) {
  if (typeof price !== "number" || typeof listPrice !== "number") return null;
  if (!Number.isFinite(price) || !Number.isFinite(listPrice)) return null;

  const priceCents = Math.round(price * 100);
  const listCents = Math.round(listPrice * 100);
  if (priceCents <= 0 || listCents <= 0 || priceCents >= listCents) return null;

  const pct = Math.round(((listCents - priceCents) / listCents) * 100);
  return pct >= 1 ? pct : null;
}

// Null means the deal's numbers are safe to publish. A deal with no list
// price and no discount is fine (nothing numeric is being claimed). A
// price-history verdict is only allowed when that discount is real.
// priceVerified is true only together with a verifiedAt timestamp.
export function dealNumberError(deal) {
  if (!deal) return "missing deal";

  const price = deal.price ?? deal.currentPrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return "missing or invalid price";
  }

  const listPrice = deal.listPrice;
  const discountPct = deal.discountPct;
  const hasList = listPrice != null;
  const hasPct = discountPct != null;

  if (deal.priceHistoryChecked === true && (!hasList || !hasPct)) {
    return "price-history verdict without a verified discount";
  }

  if (!hasList && !hasPct) return priceVerificationError(deal);

  if (!hasList || typeof listPrice !== "number" || !Number.isFinite(listPrice)) {
    return "discountPct set without a list price";
  }

  if (price >= listPrice) return "price is not below list price";

  const expected = discountPctFromPrices(price, listPrice);
  if (expected == null) return "price and list price do not yield a discount";

  if (typeof discountPct !== "number" || !Number.isInteger(discountPct)) {
    return "list price without an integer discountPct";
  }

  if (discountPct !== expected) {
    return `discountPct ${discountPct} does not match price/listPrice (${expected})`;
  }

  return priceVerificationError(deal);
}

// priceVerified and verifiedAt travel together. A confirmed price has a
// timestamp. An unconfirmed price does not. Deals that never went through
// the live check omit both, which stays valid.
export function priceVerificationError(deal) {
  if (!deal) return null;

  const flagPresent = "priceVerified" in deal && deal.priceVerified != null;
  if (flagPresent && typeof deal.priceVerified !== "boolean") {
    return "priceVerified must be true or false";
  }

  const stamp = deal.verifiedAt;
  const stampPresent = stamp != null && stamp !== "";
  if (deal.priceVerified === true) {
    if (typeof stamp !== "string" || Number.isNaN(Date.parse(stamp))) {
      return "verified price missing verifiedAt";
    }
    return null;
  }
  if (stampPresent) return "verifiedAt set without a verified price";
  return null;
}

export function publishableDeals(deals, onDrop) {
  const kept = [];
  for (const deal of deals || []) {
    const reason = dealNumberError(deal);
    if (reason) {
      if (onDrop) onDrop(deal, reason);
      continue;
    }
    kept.push(deal);
  }
  return kept;
}
