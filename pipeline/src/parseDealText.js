import { discountPctFromPrices } from "./validateDeal.js";

// Slickdeals posts are free text. Prices are read here with fixed rules —
// the model is not asked for them and cannot rewrite them.
const MONEY = /\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g;

const LIST_RE =
  /(?:\bregularly\b|\bregular\b|\boriginally\b|\borig\.?(?!\w)|\bmsrp\b|\blist(?:\s+price)?\b|\bretail\b|\bwas\b|\breg\.?(?!\w))\s*[:\-]?\s*\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/i;

const DOWN_FROM_RE =
  /\bdown\s+from\s+\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/i;

const NOW_RE = /\bnow\s+\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/i;

const PAIR_RE =
  /\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?\s*(?:\(|,|-)?\s*(?:was|reg\.?(?!\w)|regular|down\s+from)\b/i;

function money(dollars, cents) {
  return Math.round(Number(`${dollars.replace(/,/g, "")}.${cents ?? "00"}`) * 100) / 100;
}

function pricesIn(text) {
  const found = [];
  for (const match of text.matchAll(MONEY)) {
    const end = match.index + match[0].length;
    found.push({
      value: money(match[1], match[2]),
      plus: text[end] === "+",
    });
  }
  return found;
}

function listPriceIn(text) {
  const down = text.match(DOWN_FROM_RE);
  if (down) return money(down[1], down[2]);
  const list = text.match(LIST_RE);
  if (list) return money(list[1], list[2]);
  return null;
}

function claimFromText(text) {
  if (/\b(lowest\s+price|all[- ]time\s+low|\batl\b)/i.test(text)) return "Lowest price";
  if (/\bon sale\b/i.test(text)) return "On sale";
  if (/\b(clip\s+coupon|coupon|promo\s+code|with\s+code|use\s+code|using\s+code)\b/i.test(text)) {
    return "Coupon deal";
  }
  return null;
}

function codeRequired(text) {
  return /\b(?:with|use|using|promo|coupon)\s+code\b|\bclip\s+coupon\b|\bcode\s*[:#]?\s*[A-Z0-9]{4,}\b/i.test(
    text
  );
}

// Membership- or rebate-locked prices aren't a price a reader can pay.
export function isUnusablePost(text) {
  return /\b(rebate only|membership required|members only|prime members only)\b/i.test(text);
}

export function extractDealNumbers({ title = "", rawText = "" } = {}) {
  const titleText = String(title || "");
  const body = String(rawText || "");
  const combined = `${titleText}\n${body}`;

  let listPrice = listPriceIn(titleText) ?? listPriceIn(body);
  let currentPrice = null;

  const now = combined.match(NOW_RE);
  if (now) currentPrice = money(now[1], now[2]);

  if (currentPrice == null) {
    const pair = titleText.match(PAIR_RE);
    if (pair) currentPrice = money(pair[1], pair[2]);
  }

  const titlePrices = pricesIn(titleText).filter((p) => !p.plus);
  if (currentPrice == null && titlePrices.length > 0) {
    currentPrice = titlePrices[titlePrices.length - 1].value;
  }

  if (currentPrice == null) {
    const bodyPrices = pricesIn(body).filter((p) => !p.plus && p.value !== listPrice);
    if (bodyPrices.length > 0) currentPrice = bodyPrices[bodyPrices.length - 1].value;
  }

  if (currentPrice != null && listPrice != null && currentPrice === listPrice) {
    const lower = [...titlePrices].reverse().find((p) => p.value < listPrice);
    if (lower) currentPrice = lower.value;
  }

  let discountPct = null;
  if (currentPrice != null && listPrice != null) {
    discountPct = discountPctFromPrices(currentPrice, listPrice);
    // Source text that doesn't actually put the price below the was-price
    // contributes no discount. The deal can still ship at the current price.
    if (discountPct == null) listPrice = null;
  }

  return {
    currentPrice,
    listPrice: discountPct == null ? null : listPrice,
    discountPct,
    priceClaim: discountPct == null ? claimFromText(combined) : null,
    requiresCode: codeRequired(combined),
    // Was/now in a post is not a price-history check. Only the history
    // path (analyze.js) may set this true.
    priceHistoryChecked: false,
  };
}
