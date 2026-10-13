import { config } from "./config.js";
import { addBlurbs } from "./rankWithClaude.js";
import { extractDealNumbers, isUnusablePost } from "./parseDealText.js";
import { dealNumberError } from "./validateDeal.js";

// Community velocity is the tiebreak. Discount evidence, an image, no
// checkout code, and a low absolute price are fixed ranking preferences
// that used to live only in the model prompt.
function rankScore(deal) {
  const velocity = typeof deal.voteVelocity === "number" ? deal.voteVelocity : 0;
  let tier = 0;
  if (typeof deal.discountPct === "number" && deal.discountPct >= config.minDiscountPct) tier += 10000;
  else if (deal.priceClaim) tier += 5000;
  if (deal.image) tier += 100;
  if (!deal.requiresCode) tier += 50;
  if (typeof deal.currentPrice === "number" && deal.currentPrice < 30) tier += 25;
  return tier + velocity;
}

// Numbers come from the post text. Any price fields already sitting on the
// candidate (including anything a model might have attached) are replaced.
export function rankSlickdealsDeterministic(candidates, maxDeals = config.maxDealsPerDay) {
  const parsed = [];

  for (const candidate of candidates || []) {
    const text = `${candidate.title || ""}\n${candidate.rawText || ""}`;
    if (isUnusablePost(text)) continue;

    const numbers = extractDealNumbers(candidate);
    if (numbers.currentPrice == null) continue;

    const deal = { ...candidate, ...numbers };
    const reason = dealNumberError({ ...deal, price: deal.currentPrice });
    if (reason) continue;
    parsed.push(deal);
  }

  parsed.sort((a, b) => rankScore(b) - rankScore(a));
  return promoteFeaturedPick(parsed.slice(0, maxDeals));
}

export async function rankSlickdealsCandidates(candidates, maxDeals = config.maxDealsPerDay) {
  return addBlurbs(rankSlickdealsDeterministic(candidates, maxDeals));
}

// The featured card needs real discount evidence and, when any candidate
// has one, an image. Enforce that in code rather than hoping a ranking
// pass remembered.
function promoteFeaturedPick(deals) {
  if (deals.length === 0) return deals;

  const hasEvidence = (d) =>
    (typeof d.discountPct === "number" && d.discountPct >= config.minDiscountPct) || Boolean(d.priceClaim);
  const hasImage = (d) => Boolean(d.image);

  let promoteIndex = deals.findIndex((d) => hasEvidence(d) && hasImage(d));
  if (promoteIndex === -1) promoteIndex = deals.findIndex(hasImage);
  if (promoteIndex === -1) promoteIndex = deals.findIndex(hasEvidence);
  if (promoteIndex <= 0) return deals;

  const reordered = [...deals];
  const [promoted] = reordered.splice(promoteIndex, 1);
  reordered.unshift(promoted);
  return reordered;
}
