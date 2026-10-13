import { config } from "./config.js";
import { callClaudeJSON } from "./anthropic.js";

function fallbackBlurb(candidate) {
  const category = candidate.category ? ` in ${candidate.category}` : "";
  if (candidate.requiresCode) {
    return `A community-picked deal${category} that needs a code at checkout.`;
  }
  return `A community-picked deal${category}.`;
}

export function titleForPrompt(title) {
  return String(title || "")
    .replace(/\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\+?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Drops dollar amounts and "N% off" if the model includes them anyway.
// Other figures ("5-pack", "100% cotton") stay — those aren't a price claim.
export function cleanWhy(text, fallback) {
  if (typeof text !== "string") return fallback;
  const cleaned = text
    .replace(/\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g, "")
    .replace(/\b\d{1,3}\s*%\s*off\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
  if (cleaned.length < 8) return fallback;
  return cleaned;
}

// The only model output in the pipeline: one sentence per deal. Prices,
// list prices, discount percents, and the price-history flag are already
// set by the caller and are not sent back for the model to fill in.
export async function addBlurbs(deals) {
  if (!deals || deals.length === 0) return [];

  const withFallback = () => deals.map((c) => ({ ...c, blurb: fallbackBlurb(c) }));

  if (!config.anthropicApiKey) {
    console.warn("[rankWithClaude] No ANTHROPIC_API_KEY set — using fallback blurbs instead of calling Claude.");
    return withFallback();
  }

  const prompt = `You are writing the one-line "why this made the cut" note for a deal feed.
For each product, write ONE short, factual, enthusiasm-free sentence (max 20 words)
about the product itself. Do not invent facts not given below.
Do not include prices, dollar amounts, or percent-off figures. Those are computed
separately and must not appear in your sentence.

Return ONLY a raw JSON array of strings, one sentence per product, in the same order
given. No markdown code fences, no commentary — the response must be valid JSON
on its own.

Products:
${JSON.stringify(
  deals.map((c) => ({
    title: titleForPrompt(c.title),
    category: c.category || null,
    needsCode: Boolean(c.requiresCode),
  })),
  null,
  2
)}`;

  let blurbs;
  try {
    blurbs = await callClaudeJSON(prompt, { maxTokens: 1024 });
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
    blurb: cleanWhy(blurbs[i], fallbackBlurb(c)),
  }));
}

// Picks the top `maxDeals` candidates and writes a short blurb for each.
export async function rankCandidates(candidates, maxDeals = config.maxDealsPerDay) {
  return addBlurbs(candidates.slice(0, maxDeals));
}
