// Shared by the popup and by node:test. No DOM, no network.
export const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isFeedStale(generatedAt, now = Date.now()) {
  if (!generatedAt) return false;
  const generated = Date.parse(generatedAt);
  if (Number.isNaN(generated)) return false;
  return now - generated > STALE_AFTER_MS;
}

// Calendar date from the UTC timestamp or YYYY-MM-DD pick date. Avoids
// local-timezone rollover, which would show yesterday for an early-UTC run.
export function formatUtcDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return "";
  return `${month} ${Number(match[3])}`;
}

export function feedHasNoPick(feed) {
  if (!feed || feed.paused === true) return true;
  return !Array.isArray(feed.deals) || feed.deals.length === 0;
}

function discountPctFromPrices(price, listPrice) {
  if (typeof price !== "number" || typeof listPrice !== "number") return null;
  if (!Number.isFinite(price) || !Number.isFinite(listPrice)) return null;
  const priceCents = Math.round(price * 100);
  const listCents = Math.round(listPrice * 100);
  if (priceCents <= 0 || listCents <= 0 || priceCents >= listCents) return null;
  const pct = Math.round(((listCents - priceCents) / listCents) * 100);
  return pct >= 1 ? pct : null;
}

// Was/now and the percent, only when the feed's own numbers agree.
// A missing discountPct is filled from price and listPrice. A present
// discountPct that doesn't match is hidden rather than shown.
export function verifiedOffer(deal) {
  if (!deal) return null;
  const price = deal.price;
  const listPrice = deal.listPrice;
  const discountPct = discountPctFromPrices(price, listPrice);
  if (discountPct == null) return null;
  if (deal.discountPct != null && deal.discountPct !== discountPct) return null;
  return { price, listPrice, discountPct };
}

export function showPriceHistory(deal) {
  return deal?.priceHistoryChecked === true && verifiedOffer(deal) != null;
}
