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

// Woot-style blurb. Examples are energy only: every concrete detail in
// them is present in that example's fields, and the price sits in the joke.
export function buildBlurbPrompt(deals) {
  return `You write the blurb for a deal card. In the popup it sits under the label "Why this made the cut", which is already on screen. Other pages show the blurb alone. Never write "why this made the cut" or "why it made the cut".

Voice: a Woot write-up. Playful, witty, a little irreverent, a storyteller talking to a friend. Wry asides, light self-aware humor, a fun hook in the first few words. Family-friendly. Tease the situation. Do not mock the shopper.

Shape: 2 or 3 short sentences, under 45 words. One sentence is not enough story. The price, and the code or coupon or was-price when the fields allow them, land inside the joke. A punchline, a wry aside, the middle of a sentence. Not a caption glued on the end.

Never start a sentence with "It is $". Never use "with a checkout code", "code at checkout", or "as a coupon deal" as a tacked-on clause. If you delete the last sentence and the price vanishes, the price was stuck on. Weave it in earlier. Vary the endings. No two blurbs in this batch should share a rhythm.

Use only facts present in the product fields below. Never invent a price, spec, size, material, count, color, discount, brand origin, feature, or usage detail.
- Do not claim the product works, starts, lasts, lights, heats, holds, fits, cleans, organizes, or "actually" does a job unless the title says that in those words. "Actually starts your candles" is an invented claim. A title that says "flameless" may say flameless. It may not say the lighter works or starts anything.
- Do not invent a place, a user, a result, or a before-story. No candles reacting, no old cutting board or paper plates, no things shoved under a bed, no spotlight on an earring, no "your wallet". If the joke needs a scene about using the product, it is the wrong joke. Wordplay on the title, the count, the price, and the code is the joke.
- You may paraphrase a size or count that is already in the title (6 in. → six inches).
- Quote currentPrice or listPrice only by copying the number exactly, cents included. Writing $15 for a currentPrice of 15.08 invents a price. If you might round, leave the number out.
- A was-price only when listPrice and discountPct are both numbers. Copy listPrice exactly. Write "N% off" only by copying discountPct. Otherwise write no percent-off.
- "Lowest price" only when priceClaim is exactly "Lowest price". "On sale" only when priceClaim is "On sale".
- priceClaim "Coupon deal" means you may say coupon. It does not mean there is a code.
- needsCode true: mention the checkout code inside the joke. needsCode false: do not mention a code, a promo code, or a checkout code at all.
- Mention a price-history check only when priceHistoryChecked is true.
- Never write the word Amazon, even if a title originally said it. Never name a store.
- No offensive or mean humor. Do not insult the shopper's body, home, age, money, or taste. No fake hype — "lowest ever", "steal", "unbelievable", "miracle", "best price", "rare", "selling out" — unless a field above says so.
- If you are unsure, or a joke needs a fact you do not have, skip the joke and write a plain factual blurb. A short true blurb beats a cute invented one.

Return ONLY a raw JSON array of strings, one blurb per product, in the same order. No markdown fences, no commentary.

Examples are energy only. Do not copy their sentences, even when a product matches. Every concrete detail in an example is in that example's fields. Notice the three different rhythms.

Example 1 — coupon, no code, no was-price. The price is in the joke, not a footer, and nothing is invented about how glue gets used:
{"title":"4-Oz Aleene's Permanent Fabric Glue","currentPrice":15.08,"listPrice":null,"discountPct":null,"priceClaim":"Coupon deal","needsCode":false,"priceHistoryChecked":false}
"Four ounces of Aleene's permanent fabric glue at $15.08, coupon deal, full stop. We tried to add a subplot. The facts declined."

Example 2 — code required, no was-price. The code is a character in the bit, and the ending does not match example 1:
{"title":"HOTO 24-in-1 Mini Screwdriver Set","currentPrice":12.99,"listPrice":null,"discountPct":null,"priceClaim":"Coupon deal","needsCode":true,"priceHistoryChecked":false}
"Twenty-four tiny drivers, one HOTO set, $12.99. The checkout code is the intermission. Coupon deal is the credits."

Example 3 — was-price, no code. Opens on the price, which the others do not, and invents no room in the house:
{"title":"Soft Throw Blanket","currentPrice":20,"listPrice":50,"discountPct":60,"priceClaim":null,"needsCode":false,"priceHistoryChecked":false}
"$20 for a soft throw, under a $50 was-price, 60% off. The math asked for a drumroll. The encore is the same soft throw."

Before you write each blurb, check it:
- 2 or 3 sentences. The exact price sits in a sentence that also has a title word or a joke.
- Later sentences only riff on words you already used. They do not add a room, a result, or a person who is not in the title.
- "Candles will never know what hit them" is a result. So is a yard having opinions, or space under a bed. Delete that kind of sentence.
- needsCode false: do not write "code" at all. needsCode true: the checkout code is part of the bit. Do not write "with the checkout code applied" or "at checkout with the code".
- Do not copy the example sentences. The products below are not the examples.

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
    // Lower temperature so the joke stays on the title and the price
    // instead of wandering into a made-up use.
    blurbs = await callClaudeJSON(prompt, { maxTokens: 2048, temperature: 0.4 });
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
