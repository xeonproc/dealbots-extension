import { config } from "./config.js";
import { callClaudeJSON } from "./anthropic.js";

// How many top-by-vote-velocity Slickdeals posts to hand to Claude. Keeps
// token usage bounded while still giving it real choices.
const CANDIDATE_POOL_SIZE = 30;

// Slickdeals posts are free text ("$45.99 after promo code X", "was $80 now
// $45", etc.) — no clean structured price field. Claude both picks the best
// candidate(s) AND extracts the price fields from the raw text in one call,
// which a fixed regex can't reliably do across this much variety of phrasing.
export async function rankSlickdealsCandidates(candidates, maxDeals = config.maxDealsPerDay) {
  if (!config.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required for DATA_SOURCE=slickdeals (Claude both ranks and " +
        "extracts price data from the raw post text — there's no fallback path)."
    );
  }

  const pool = candidates.slice(0, CANDIDATE_POOL_SIZE);

  const prompt = `You are building today's deal feed for a shopping extension from real
Slickdeals.net community posts. Each post links to a specific Amazon product. The output
powers two surfaces: a single "featured" pick and a longer "more deals" list.

SKIP entirely only posts where: the price requires an account/membership/rebate to unlock,
the item is a grocery/consumable oddity, or no single current price is stated at all. Do NOT
skip a post just because it needs a promo/coupon code — that's still a real, usable deal, just
note it in the blurb (e.g. "with code at checkout").

Rank ALL remaining valid candidates (by a mix of trendVelocity — community votes per hour
since posted, a proxy for rising demand — and how compelling the deal genuinely is), best
first, up to ${maxDeals} total. Include EVERY candidate that has a clearly stated price, even
ordinary/unexciting ones — the list needs enough variety, and a plain-but-real deal ranked low
still belongs on it. Do not shrink the list just because most candidates aren't exceptional;
only exclude ones that fail the SKIP rule above.

No purchase or personalization data exists for these viewers — every visitor is a stranger
seeing this cold, so "compelling" means likely to convert a stranger, not just discounted.
Prefer items that are broadly useful, low absolute price (under ~$30 as a soft ceiling), require
no size/color/variant decision, and need no promo code — rank these above equally-discounted
items that lack them. Treat apparel/sizing-dependent items as lower priority unless the discount
is exceptional. These are ranking preferences, not hard filters — don't exclude an otherwise
strong candidate just because it's over $30 or needs a code, just don't rank it above an
equally-good candidate that doesn't have that friction.

The FIRST item in your ranking becomes the "featured" pick shown most prominently, so it needs
a real reason to be featured, not just convenience: it MUST have either a computable discountPct
of at least ${config.minDiscountPct}%, OR an explicit priceClaim (see below) — a plain-priced
item with no discount evidence, no matter how "clean," must NOT be placed first. Rank items
with genuine discount evidence above equally-clean items that have none. If NO candidate has a
real discount or price claim, still return the list (ranked by trendVelocity/compellingness as
usual) — don't fabricate one just to satisfy this rule. For each pick, return:
- "index": its index in the list below
- "currentPrice": the price as a plain number (no $ sign) — the price after any code, if one's needed
- "listPrice": the "was"/regular price as a plain number, ONLY if explicitly stated in the
  text — otherwise null
- "discountPct": integer percent off, ONLY if you can compute it from currentPrice and
  listPrice — otherwise null
- "priceClaim": ONLY when discountPct is null AND the text itself signals a discount without
  giving a specific comparison number — this includes explicit superiority claims ("lowest
  price ever", "all-time low") AND plainer phrasing like "on sale for $X" or "clip coupon" /
  "apply code" wording (use "On Sale" or "Coupon Deal" for those). A short label (max 4 words),
  title-cased. Otherwise null — if the text states only a plain price with no sale/coupon/deal
  language at all (just "has X for $Y"), leave this null. Never invent a claim the text doesn't
  make.
- "requiresCode": true if a promo/coupon code is needed to reach currentPrice, else false
- "blurb": one short, factual, enthusiasm-free sentence (max 20 words) explaining why it's a
  good pick today. Describe ONLY what the text actually says (product features, the stated
  price, whether a code is needed). Do NOT characterize the price with words like "clearance",
  "lowest", "great deal", "bargain", etc. unless the text itself uses that framing — factual
  product description is fine even when there's no price claim to make.

Return ONLY a raw JSON array of those objects, best pick first. No markdown fences, no
commentary. If NO candidate has any clearly stated, actionable price, return an empty array [].

Posts:
${JSON.stringify(
  pool.map((c, index) => ({
    index,
    title: c.title,
    trendVelocity: c.voteVelocity,
    text: c.rawText,
  })),
  null,
  2
)}`;

  const picks = await callClaudeJSON(prompt, { maxTokens: 4096 });

  const ranked = picks
    .filter((p) => pool[p.index])
    .map((p) => ({
      ...pool[p.index],
      currentPrice: p.currentPrice,
      listPrice: p.listPrice ?? null,
      discountPct: p.discountPct ?? null,
      priceClaim: p.discountPct ? null : p.priceClaim ?? null,
      requiresCode: p.requiresCode ?? false,
      blurb: p.blurb,
    }));

  return promoteFeaturedPick(ranked);
}

// The prompt instructs Claude to only feature an item with real discount
// evidence, but that's a soft instruction, not a guarantee — observed in
// practice to get ignored sometimes (a plain-priced item placed first over
// candidates with a real discountPct or priceClaim just below it). This is
// a hard business rule, not a judgment call, so enforce it in code rather
// than trust the model every run: promote the first qualifying candidate
// to the front if Claude didn't already put one there, keeping everyone
// else's relative order. If nothing qualifies, leave Claude's order as is.
function promoteFeaturedPick(deals) {
  if (deals.length === 0) return deals;

  // Matches the prompt's stated bar exactly — a discount under
  // minDiscountPct is "truthy" but isn't the real reason-to-feature the
  // rule is meant to guarantee (caught via a real run: a 5% pick blocked
  // promotion of 51%/38% candidates sitting right below it, because 5 is
  // truthy).
  const hasEvidence = (d) =>
    (typeof d.discountPct === "number" && d.discountPct >= config.minDiscountPct) ||
    Boolean(d.priceClaim);
  if (hasEvidence(deals[0])) return deals;

  const promoteIndex = deals.findIndex(hasEvidence);
  if (promoteIndex <= 0) return deals;

  const reordered = [...deals];
  const [promoted] = reordered.splice(promoteIndex, 1);
  reordered.unshift(promoted);
  return reordered;
}
