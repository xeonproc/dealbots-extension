import { config } from "./config.js";
import { callClaudeJSON } from "./anthropic.js";

function fallbackBlurb(candidate) {
  const category = candidate.category ? ` in ${candidate.category}` : "";
  if (candidate.requiresCode) {
    return `A community-picked deal${category} that needs a code at checkout.`;
  }
  return `A community-picked deal${category}.`;
}

// Forum titles often carry a price and "at Amazon". The card already shows
// the price, and the blurb is not allowed to name Amazon, so neither goes
// to the model as part of the title. The numeric price is passed separately.
export function titleForPrompt(title) {
  return String(title || "")
    .replace(/^(?:\[[^\]]+\]\s*)+/, "")
    .replace(/\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\+?/g, "")
    .replace(/\bat\s+amazon(?:\.com)?\b/gi, "")
    .replace(/\bamazon(?:\.com)?\b/gi, "")
    .replace(/[*|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function priceValues(deal) {
  if (!deal) return [];
  return [deal.currentPrice, deal.price, deal.listPrice].filter(
    (n) => typeof n === "number" && Number.isFinite(n)
  );
}

function priceIsAllowed(numText, deal) {
  const value = Number(String(numText).replace(/,/g, ""));
  if (!Number.isFinite(value)) return false;
  const cents = Math.round(value * 100);
  return priceValues(deal).some((n) => Math.round(n * 100) === cents);
}

// Drops dollar amounts and "N% off" that are not the deal's own parsed
// figures. An exact currentPrice, listPrice, or discountPct may stay.
// Other figures ("5-pack", "100% cotton") stay — those aren't a price claim.
// Naming Amazon, or a price that doesn't match, falls back rather than
// publishing a blurb with a made-up number or a store name.
export function cleanWhy(text, fallback, deal) {
  if (typeof text !== "string") return fallback;
  if (/\bamazon\b/i.test(text)) return fallback;

  let dropped = false;
  const cleaned = text
    .replace(/\bwhy (?:this|it) made the cut\b\s*:?\s*/gi, "")
    .replace(/\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g, (match, num) => {
      if (priceIsAllowed(num, deal)) return `$${num}`;
      dropped = true;
      return "";
    })
    .replace(/\b(\d{1,3})\s*%\s*off\b/gi, (full, n) => {
      if (deal && typeof deal.discountPct === "number" && Number(n) === deal.discountPct) {
        return `${Number(n)}% off`;
      }
      dropped = true;
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

  if (deal && dropped) return fallback;
  // A coupon is not a checkout code. Only requiresCode may say one is needed.
  if (
    deal &&
    deal.requiresCode !== true &&
    /\b(checkout code|promo code|coupon code|with a code|code at checkout|code required)\b/i.test(cleaned)
  ) {
    return fallback;
  }
  if (cleaned.length < 8) return fallback;
  return cleaned;
}

export function dealForBlurbPrompt(deal) {
  const currentPrice =
    typeof deal.currentPrice === "number"
      ? deal.currentPrice
      : typeof deal.price === "number"
        ? deal.price
        : null;
  return {
    title: titleForPrompt(deal.title),
    category: deal.category || null,
    currentPrice,
    listPrice: typeof deal.listPrice === "number" ? deal.listPrice : null,
    discountPct: typeof deal.discountPct === "number" ? deal.discountPct : null,
    priceClaim: deal.priceClaim || null,
    needsCode: Boolean(deal.requiresCode),
    priceHistoryChecked: deal.priceHistoryChecked === true,
  };
}

// Cheeky pitch plus one factual sentence. Examples are style only: every
// concrete detail in them is present in that example's fields.
export function buildBlurbPrompt(deals) {
  return `You write the blurb for a deal card. In the extension popup it sits under the label "Why this made the cut". That label is already on screen. Other pages and posts show the blurb with no label, so it has to stand on its own. Never write "why this made the cut" or "why it made the cut".

Voice: a witty friend a little too excited about a bargain. Cheeky and self-aware. Light teasing of the product or the shopper is fine.

Shape:
- One or two short sentences of that pitch.
- Then one plain sentence on why it is actually a deal.
- Under 45 words total.

Use only facts present in the product fields below. Never invent a price, spec, size, material, count, discount, brand origin, durability, or quality claim. A joke may tease the shopper (the junk drawer, a chore they keep putting off). It may not smuggle in a product claim. Do not say the product works, lasts, is sturdy, or is better than what they own unless the title says so. You may paraphrase a size or count that is already in the title. If you are unsure, or a joke would need a fact you do not have, skip the joke and write a plain factual blurb.

Each sentence must be a complete sentence. Do not end on a fragment that is only a price plus a label, and do not reuse one closing sentence on every product. "It is $X with a checkout code" is not a template.

Prices and deal claims:
- You may quote currentPrice or listPrice only by copying the number exactly, cents included. Writing $15 for a currentPrice of 15.08 invents a price. If you might round, leave the number out.
- You may say it is below a was-price only when listPrice and discountPct are both numbers. If you mention the was-price, copy listPrice exactly.
- You may write "N% off" only when discountPct is a number, and only by copying that integer. Otherwise write no percent-off.
- "Lowest price" only when priceClaim is exactly "Lowest price". "On sale" only when priceClaim is "On sale".
- "Coupon deal" is not a checkout code. When priceClaim is "Coupon deal", you may say it is a coupon deal. When it is anything else, do not say coupon.
- needsCode true means a code is required at checkout, and you may say that. needsCode false means you must not mention a code, a promo code, or a checkout code at all.
- Mention a price-history check only when priceHistoryChecked is true.
- Never write the word Amazon, even if a title originally said it. Never name a store.

No offensive or mean humor. Do not insult the shopper's body, home, age, money, or taste. No fake hype — "lowest ever", "steal", "unbelievable", "miracle", "best price", "rare", "selling out" — unless the fields above explicitly support that claim.

Return ONLY a raw JSON array of strings, one blurb per product, in the same order. No markdown fences, no commentary. Do not include these examples in the array.

Examples are style only. Every concrete detail in an example blurb is taken from that example's fields. Do not reuse an example's wording on a different product.

Example 1 — coupon deal, no was-price. The plain sentence does not invent a comparison, a material, or a rounded price:
{"title":"6 in. Wiha Adjustable Wrench","currentPrice":15.08,"listPrice":null,"discountPct":null,"priceClaim":"Coupon deal","needsCode":false,"priceHistoryChecked":false}
"Six inches of Wiha adjustable wrench for when the junk-drawer one finally gives up. $15.08 for the replacement you were going to buy anyway. The post marks it as a coupon deal."

Example 2 — was-price is present, so the plain sentence may use those exact figures and nothing past them:
{"title":"Soft Throw Blanket","currentPrice":20,"listPrice":50,"discountPct":60,"priceClaim":null,"needsCode":false,"priceHistoryChecked":false}
"A soft throw for the couch that has been fine for three winters. You know the one. It is $20, below the was-price of $50 listed in the post."

Products:
${JSON.stringify(deals.map(dealForBlurbPrompt), null, 2)}`;
}

// The only model output in the pipeline: a short blurb per deal. Prices,
// list prices, discount percents, and the price-history flag are already
// set by the caller. The model may quote those figures exactly.
export async function addBlurbs(deals) {
  if (!deals || deals.length === 0) return [];

  const withFallback = () => deals.map((c) => ({ ...c, blurb: fallbackBlurb(c) }));

  if (!config.anthropicApiKey) {
    console.warn("[rankWithClaude] No ANTHROPIC_API_KEY set — using fallback blurbs instead of calling Claude.");
    return withFallback();
  }

  const prompt = buildBlurbPrompt(deals);

  let blurbs;
  try {
    // A few dozen words per deal, up to maxDealsPerDay of them.
    blurbs = await callClaudeJSON(prompt, { maxTokens: 2048 });
  } catch (err) {
    console.warn("[rankWithClaude] Claude call/parse failed, using fallback blurbs.", err);
    return withFallback();
  }

  if (!Array.isArray(blurbs)) {
    console.warn("[rankWithClaude] Claude did not return a JSON array — using fallback blurbs.");
    return withFallback();
  }

  return deals.map((c, i) => ({
    ...c,
    blurb: cleanWhy(blurbs[i], fallbackBlurb(c), c),
  }));
}

// Picks the top `maxDeals` candidates and writes a short blurb for each.
export async function rankCandidates(candidates, maxDeals = config.maxDealsPerDay) {
  return addBlurbs(candidates.slice(0, maxDeals));
}
