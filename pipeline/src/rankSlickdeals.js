import { config } from "./config.js";
import { callClaudeJSON } from "./anthropic.js";

// How many top-by-thumb-score Slickdeals posts to hand to Claude. Keeps
// token usage bounded while still giving it real choices.
const CANDIDATE_POOL_SIZE = 20;

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

  const prompt = `You are picking today's "deal of the day" for a shopping newsletter from
real Slickdeals.net community posts. Each post links to a specific Amazon product.

For each post, decide if it's a genuinely good, clearly-priced deal a typical shopper could
act on right now. SKIP posts where: the final price depends on a coupon/promo code that might
not work, the price requires an account/membership/rebate, the item is a grocery/consumable
oddity, or the price isn't clearly stated as a single number.

From the remaining good candidates, pick the best ${maxDeals} (by a mix of thumbScore and how
compelling the deal genuinely is). For each pick, return:
- "index": its index in the list below
- "currentPrice": the price as a plain number (no $ sign)
- "listPrice": the "was"/regular price as a plain number, ONLY if explicitly stated in the
  text — otherwise null
- "discountPct": integer percent off, ONLY if you can compute it from currentPrice and
  listPrice — otherwise null
- "blurb": one short, factual, enthusiasm-free sentence (max 20 words) explaining why it's a
  good pick today

Return ONLY a raw JSON array of those objects, best pick first. No markdown fences, no
commentary. If NO candidate is a clear, actionable, genuine deal, return an empty array [].

Posts:
${JSON.stringify(
  pool.map((c, index) => ({
    index,
    title: c.title,
    thumbScore: c.thumbScore,
    text: c.rawText,
  })),
  null,
  2
)}`;

  const picks = await callClaudeJSON(prompt, { maxTokens: 1024 });

  return picks
    .filter((p) => pool[p.index])
    .map((p) => ({
      ...pool[p.index],
      currentPrice: p.currentPrice,
      listPrice: p.listPrice ?? null,
      discountPct: p.discountPct ?? null,
      blurb: p.blurb,
    }));
}
