import { config } from "./config.js";
import { callClaudeJSON } from "./anthropic.js";

function fallbackBlurb(candidate) {
  return `Trending up in ${candidate.category || "its category"} and ${candidate.discountPct}% below its usual price.`;
}

// Picks the top `maxDeals` candidates and writes a short blurb for each.
// Falls back to a plain-template blurb (no network call) when no
// ANTHROPIC_API_KEY is set, so the pipeline is fully testable offline.
export async function rankCandidates(candidates, maxDeals = config.maxDealsPerDay) {
  const shortlist = candidates.slice(0, maxDeals);

  if (!config.anthropicApiKey) {
    console.warn(
      "[rankWithClaude] No ANTHROPIC_API_KEY set — using fallback blurbs instead of calling Claude."
    );
    return shortlist.map((c) => ({ ...c, blurb: fallbackBlurb(c) }));
  }

  const prompt = `You are picking today's "deal of the day" for a shopping newsletter.
Below are candidate products that are both trending (rising in Amazon sales rank) and
genuinely discounted (vs. their own 90-day average price, not an inflated "was" price).

For each product, write ONE short, factual, enthusiasm-free sentence (max 20 words)
explaining why it's a good pick today. Do not invent facts not given below.

Return ONLY a raw JSON array of strings, one blurb per product, in the same order
given. No markdown code fences, no commentary — the response must be valid JSON
on its own.

Products:
${JSON.stringify(
  shortlist.map((c) => ({
    title: c.title,
    category: c.category,
    discountPct: c.discountPct,
    currentPrice: c.currentPrice,
    listPrice: c.listPrice,
  })),
  null,
  2
)}`;

  let blurbs;
  try {
    blurbs = await callClaudeJSON(prompt, { maxTokens: 512 });
  } catch (err) {
    console.warn("[rankWithClaude] Claude call/parse failed, using fallback blurbs.", err);
    return shortlist.map((c) => ({ ...c, blurb: fallbackBlurb(c) }));
  }

  return shortlist.map((c, i) => ({ ...c, blurb: blurbs[i] || fallbackBlurb(c) }));
}
