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
powers two surfaces: a single "featured" pick (must be the cleanest, most compelling deal)
and a longer "more deals" list (can include good deals with minor friction).

SKIP entirely only posts where: the price requires an account/membership/rebate to unlock,
the item is a grocery/consumable oddity, or no single current price is stated at all. Do NOT
skip a post just because it needs a promo/coupon code — that's still a real, usable deal, just
note it in the blurb (e.g. "with code at checkout").

Rank ALL remaining valid candidates (by a mix of trendVelocity — community votes per hour
since posted, a proxy for rising demand, not just total popularity — and how compelling the
deal genuinely is), best first, up to ${maxDeals} total. Include EVERY candidate that has a
clearly stated price, even ordinary/unexciting ones — the list needs enough variety, and a
plain-but-real deal ranked low still belongs on it. Do not shrink the list just because most
candidates aren't exceptional; only exclude ones that fail the SKIP rule above. Put the single
cleanest, no-friction, clearly-priced deal first — that one becomes the featured pick, so hold
IT (only) to a higher bar. For each pick, return:
- "index": its index in the list below
- "currentPrice": the price as a plain number (no $ sign) — the price after any code, if one's needed
- "listPrice": the "was"/regular price as a plain number, ONLY if explicitly stated in the
  text — otherwise null
- "discountPct": integer percent off, ONLY if you can compute it from currentPrice and
  listPrice — otherwise null
- "requiresCode": true if a promo/coupon code is needed to reach currentPrice, else false
- "blurb": one short, factual, enthusiasm-free sentence (max 20 words) explaining why it's a
  good pick today

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

  return picks
    .filter((p) => pool[p.index])
    .map((p) => ({
      ...pool[p.index],
      currentPrice: p.currentPrice,
      listPrice: p.listPrice ?? null,
      discountPct: p.discountPct ?? null,
      requiresCode: p.requiresCode ?? false,
      blurb: p.blurb,
    }));
}
