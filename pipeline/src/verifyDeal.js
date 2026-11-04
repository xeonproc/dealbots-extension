// Last check before a pick is published.
//
// The source thread is dropped when it is marked expired or sold out.
// The product page is fetched best-effort. A live price more than 10%
// above the feed price drops the pick. A coupon counts only when that
// page shows one. A blocked or unreadable page keeps the pick with
// priceVerified false so ranking can place a verified pick first.
//
// sources/keepaLive.js is not used. It is an unimplemented stub that
// needs a paid Keepa key.

export const PRICE_DRIFT_TOLERANCE = 0.1;
export const FRESH_POST_MS = 24 * 60 * 60 * 1000;

const THREAD_HEADERS = {
  "user-agent": "dealbots-pipeline/0.1 (+https://github.com/xeonproc/dealbots-extension)",
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9",
};

// A browser-like agent is what actually returns the buy-box price from
// GitHub-hosted runners. The pipeline agent is fine for the source thread.
const PRODUCT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

function money(dollars, cents) {
  return Math.round(Number(`${String(dollars).replace(/,/g, "")}.${cents ?? "00"}`) * 100) / 100;
}

function firstMoney(text) {
  const match = String(text || "").match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\.(\d{2})/);
  if (!match) return null;
  return money(match[1], match[2]);
}

function textFromHtml(chunk) {
  return String(chunk || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function uniquePrices(prices) {
  const cents = [];
  for (const price of prices) {
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue;
    const value = Math.round(price * 100);
    if (!cents.includes(value)) cents.push(value);
  }
  return cents.map((value) => value / 100);
}

// Posts from the last day outrank older ones with the same other evidence.
// A timestamp slightly in the future still counts, so a clock skew does
// not punish a post that just went up.
export function isFreshPost(pubDate, now = Date.now()) {
  const posted = new Date(pubDate).getTime();
  if (Number.isNaN(posted)) return false;
  const at = now instanceof Date ? now.getTime() : now;
  const age = at - posted;
  return age >= -60 * 60 * 1000 && age <= FRESH_POST_MS;
}

export function threadUrl(link) {
  const decoded = String(link || "")
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/&#0?38;/g, "&");
  if (!decoded) return "";
  try {
    const url = new URL(decoded);
    const host = url.hostname.toLowerCase();
    if (host !== "slickdeals.net" && !host.endsWith(".slickdeals.net")) return "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function productUrl(asin) {
  if (!/^[A-Z0-9]{10}$/.test(String(asin || ""))) return "";
  return `https://www.amazon.com/dp/${asin}`;
}

function readNuxtIsExpired(html) {
  const match = String(html || "").match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (!("isExpired" in item) || !("mainDesktopBlock" in item)) continue;
    const ref = item.isExpired;
    if (typeof ref === "boolean") return ref;
    if (typeof ref === "number" && ref >= 0 && ref < data.length && typeof data[ref] === "boolean") {
      return data[ref];
    }
  }
  return null;
}

function pageTitle(html) {
  const match = String(html || "").match(/<title>([\s\S]*?)<\/title>/i);
  return match ? textFromHtml(match[1]) : "";
}

// Structured flags only, plus a title or banner the source itself edited.
// The standing "report this deal if expired" sentence is not a mark.
export function threadSignals(html) {
  const source = String(html || "");
  const nuxtExpired = readNuxtIsExpired(source);
  const readable = source.includes("isExpiredDeal") || nuxtExpired != null;
  const title = pageTitle(source);
  const withoutCode = source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const expired =
    nuxtExpired === true ||
    /"isExpiredDeal"\s*:\s*"Yes"/i.test(source) ||
    /data-expiredmodal="1"/.test(source) ||
    /class="[^"]*\bdealDetailsMainBlock--expired\b/.test(source) ||
    /class="[^"]*\bdealDetailsMainBlockMobile--expired\b/.test(source) ||
    /this deal (?:has|is) expired/i.test(withoutCode) ||
    /\bexpired\b/i.test(title);

  const soldOut = /\b(sold\s*out|out of stock|oos)\b/i.test(title);

  return { readable, expired, soldOut, title };
}

export function judgeThread(html, httpStatus = 200) {
  if (httpStatus === 403 || httpStatus === 429 || httpStatus === 503 || httpStatus === 0) {
    return { action: "keep", reason: "source thread blocked" };
  }
  if (httpStatus >= 400) {
    return { action: "keep", reason: "source thread unreadable" };
  }

  const signals = threadSignals(html);
  if (signals.soldOut) return { action: "drop", reason: "source thread is sold out" };
  if (signals.expired) return { action: "drop", reason: "source thread is expired" };

  if (!signals.readable) {
    const head = String(html || "").slice(0, 2500).toLowerCase();
    if (!html || /just a moment|cf-browser-verification|attention required|captcha/.test(head)) {
      return { action: "keep", reason: "source thread blocked" };
    }
    return { action: "keep", reason: "source thread unreadable" };
  }

  return { action: "keep", reason: null };
}

function withoutEmbeddedCode(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function pricesFromPriceToPay(html) {
  const found = [];
  const label = /id="apex-pricetopay-accessibility-label"[^>]*>([^<]*)</gi;
  for (const match of html.matchAll(label)) {
    const price = firstMoney(match[1]);
    if (price != null) found.push(price);
  }
  if (found.length > 0) return found;

  const block = /class="[^"]*\bpriceToPay\b[^"]*"[\s\S]{0,700}/gi;
  for (const match of html.matchAll(block)) {
    const whole = match[0].match(/a-price-whole">\s*([0-9][0-9,]*)/);
    const fraction = match[0].match(/a-price-fraction">\s*(\d{2})/);
    if (whole && fraction) found.push(money(whole[1], fraction[1]));
  }
  return found;
}

function couponRegion(html) {
  const start = html.search(/apex-pricetopay-accessibility-label|\bpriceToPay\b/);
  if (start < 0) return html.slice(0, 400000);
  return html.slice(Math.max(0, start - 2000), start + 400000);
}

function parseCouponLabel(text) {
  const cleaned = textFromHtml(text);
  if (!cleaned) return null;
  if (/\bcoupon applied\b/i.test(cleaned) && !/\bapply\b/i.test(cleaned)) {
    return { alreadyApplied: true };
  }

  let match = cleaned.match(/\bapply\s+(\d{1,2})%\s+coupon\b/i);
  if (match) return { percent: Number(match[1]) };

  match = cleaned.match(/\b(\d{1,2})%\s+off\s+coupon\b/i);
  if (match && !/\bapplied\b/i.test(cleaned)) return { percent: Number(match[1]) };

  match = cleaned.match(
    /\b(?:apply|save|clip)\s+\$\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.(\d{2}))?\s+coupon\b/i
  );
  if (match) return { amount: money(match[1], match[2]) };

  match = cleaned.match(/\bcoupon price\s+\$\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.(\d{2}))?/i);
  if (match) return { explicitPrice: money(match[1], match[2]) };

  if (/\bcoupon\b/i.test(cleaned) && /\b(apply|save|clip|off|price)\b/i.test(cleaned)) {
    return { unparsed: true };
  }
  return null;
}

function couponLabels(html) {
  const labels = [];
  // Advance only past the class token. A long capture would swallow the
  // next coupon label and hide a disagreement.
  const re = /class="[^"]*\bcouponLabelText\b[^"]*"/gi;
  for (const match of html.matchAll(re)) {
    labels.push(html.slice(match.index, match.index + 400));
  }
  const explicit = /Coupon price[\s\S]{0,80}/gi;
  for (const match of html.matchAll(explicit)) labels.push(match[0]);
  return labels;
}

export function priceAfterPercentOff(price, percent) {
  const cents = Math.round(price * 100);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  if (!Number.isInteger(percent) || percent <= 0 || percent >= 100) return null;
  const off = Math.round((cents * percent) / 100);
  const next = cents - off;
  if (next <= 0) return null;
  return next / 100;
}

export function priceAfterAmountOff(price, amount) {
  const next = Math.round(price * 100) - Math.round(amount * 100);
  if (next <= 0) return null;
  return next / 100;
}

function couponKey(coupon) {
  return JSON.stringify(coupon);
}

// One detected coupon. Conflicting coupons, or a coupon phrase we cannot
// turn into a price, leave the page ambiguous instead of guessing.
function applyCoupon(price, labels) {
  const parsed = labels.map(parseCouponLabel).filter(Boolean);
  if (parsed.some((coupon) => coupon.unparsed)) {
    return { ambiguous: true, coupon: null, effectivePrice: null };
  }

  const usable = parsed.filter((coupon) => !coupon.alreadyApplied);
  if (usable.length === 0) {
    return { ambiguous: false, coupon: null, effectivePrice: price };
  }

  const distinct = [...new Map(usable.map((coupon) => [couponKey(coupon), coupon])).values()];
  const effects = distinct.map((coupon) => couponEffect(price, coupon));
  if (effects.some((value) => value == null)) {
    return { ambiguous: true, coupon: null, effectivePrice: null };
  }
  const cents = effects.map((value) => Math.round(value * 100));
  const low = Math.min(...cents);
  const high = Math.max(...cents);
  // A percent-off and a printed coupon price for the same offer can differ
  // by a cent. Farther apart than that, the page is not one price.
  if (high - low > 2) return { ambiguous: true, coupon: null, effectivePrice: null };
  const coupon = distinct.find((item) => Math.round(couponEffect(price, item) * 100) === low) || distinct[0];
  return { ambiguous: false, coupon, effectivePrice: low / 100 };
}

function couponEffect(price, coupon) {
  if (typeof coupon.explicitPrice === "number") {
    if (coupon.explicitPrice <= 0 || coupon.explicitPrice > price) return null;
    return coupon.explicitPrice;
  }
  if (typeof coupon.percent === "number") return priceAfterPercentOff(price, coupon.percent);
  if (typeof coupon.amount === "number") return priceAfterAmountOff(price, coupon.amount);
  return null;
}

function isProductBlocked(html, status) {
  if (status === 403 || status === 429 || status === 503 || status === 0) return true;
  if (!html) return true;
  if (/apex-pricetopay-accessibility-label|\bpriceToPay\b/.test(html)) return false;
  return /validateCaptcha|opfcaptcha|robot check|not a robot|api-services-support@amazon|type the characters you see/i.test(
    html
  );
}

export function parseProductPage(html, { status = 200 } = {}) {
  const empty = { price: null, effectivePrice: null, coupon: null };
  if (isProductBlocked(html, status)) return { status: "blocked", ...empty };

  const visible = withoutEmbeddedCode(html);
  const prices = uniquePrices(pricesFromPriceToPay(visible));
  if (prices.length !== 1) {
    return { status: "ambiguous", ...empty, price: prices[0] ?? null };
  }

  const price = prices[0];
  const applied = applyCoupon(price, couponLabels(couponRegion(visible)));
  if (applied.ambiguous || typeof applied.effectivePrice !== "number") {
    return { status: "ambiguous", price, effectivePrice: null, coupon: null };
  }
  return {
    status: "ok",
    price,
    effectivePrice: applied.effectivePrice,
    coupon: applied.coupon,
  };
}

export function maxBelievableCents(feedCents, tolerance = PRICE_DRIFT_TOLERANCE) {
  const basisPoints = Math.round((1 + tolerance) * 1000);
  return Math.round((feedCents * basisPoints) / 1000);
}

export function livePriceTooHigh(feedPrice, livePrice, tolerance = PRICE_DRIFT_TOLERANCE) {
  const feedCents = Math.round(feedPrice * 100);
  const liveCents = Math.round(livePrice * 100);
  if (feedCents <= 0 || liveCents <= 0) return false;
  return liveCents > maxBelievableCents(feedCents, tolerance);
}

function moneyText(value) {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function judgeLivePrice(feedPrice, page) {
  if (!page || page.status === "blocked") {
    return { action: "keep", priceVerified: false, reason: "product page blocked" };
  }
  if (page.status !== "ok" || typeof page.effectivePrice !== "number") {
    return { action: "keep", priceVerified: false, reason: "product page price ambiguous" };
  }
  if (typeof feedPrice !== "number" || !Number.isFinite(feedPrice) || feedPrice <= 0) {
    return { action: "keep", priceVerified: false, reason: "product page price ambiguous" };
  }
  if (livePriceTooHigh(feedPrice, page.effectivePrice)) {
    const afterCoupon = page.coupon ? " after detected coupon" : "";
    return {
      action: "drop",
      priceVerified: false,
      reason: `live price ${moneyText(page.effectivePrice)}${afterCoupon} is more than 10% above feed price ${moneyText(feedPrice)}`,
    };
  }
  return { action: "keep", priceVerified: true, reason: null };
}

async function fetchText(fetchImpl, url) {
  const headers = /slickdeals\.net/i.test(url) ? THREAD_HEADERS : PRODUCT_HEADERS;
  try {
    const res = await fetchImpl(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const html = await res.text();
    return { status: res.status, html, error: null };
  } catch (error) {
    return { status: 0, html: "", error };
  }
}

function stamp(deal, priceVerified, verifiedAt) {
  return { ...deal, priceVerified, verifiedAt };
}

export async function verifyDeal(deal, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const feedPrice = typeof deal?.currentPrice === "number" ? deal.currentPrice : deal?.price;
  const threadLink = threadUrl(deal?.sourceLink);
  const pageLink = productUrl(deal?.asin);

  const threadPromise = threadLink ? fetchText(fetchImpl, threadLink) : Promise.resolve(null);
  const pagePromise = pageLink ? fetchText(fetchImpl, pageLink) : Promise.resolve(null);
  const [thread, pageRes] = await Promise.all([threadPromise, pagePromise]);

  if (thread && !thread.error) {
    const judged = judgeThread(thread.html, thread.status);
    if (judged.action === "drop") {
      return { drop: true, deal, reason: judged.reason };
    }
  }

  if (!pageRes || pageRes.error) {
    return {
      drop: false,
      deal: stamp(deal, false, null),
      reason: pageRes?.error ? "product page blocked" : "product page price ambiguous",
    };
  }

  const parsed = parseProductPage(pageRes.html, { status: pageRes.status });
  const judged = judgeLivePrice(feedPrice, parsed);
  if (judged.action === "drop") return { drop: true, deal, reason: judged.reason };
  return {
    drop: false,
    deal: stamp(deal, judged.priceVerified, judged.priceVerified ? now.toISOString() : null),
    reason: judged.reason,
  };
}

export async function verifyDeals(deals, options = {}) {
  const list = deals || [];
  if (list.length === 0) return [];

  const results = new Array(list.length);
  let next = 0;
  const workers = Math.min(options.concurrency ?? 4, list.length);

  async function run() {
    while (next < list.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await verifyDeal(list[index], options);
      } catch (error) {
        results[index] = {
          drop: false,
          deal: stamp(list[index], false, null),
          reason: "product page blocked",
          error,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => run()));

  const kept = [];
  for (const result of results) {
    if (!result || result.drop) {
      if (result?.drop && options.onDrop) options.onDrop(result.deal, result.reason);
      continue;
    }
    kept.push(result.deal);
  }
  return kept;
}
