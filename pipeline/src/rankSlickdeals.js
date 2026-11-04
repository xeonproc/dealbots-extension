import { config } from "./config.js";
import { addBlurbs } from "./rankWithClaude.js";
import { extractDealNumbers, isUnusablePost } from "./parseDealText.js";
import { dealNumberError } from "./validateDeal.js";
import { isFreshPost, verifyDeals } from "./verifyDeal.js";

// Community velocity is the tiebreak. Discount evidence, an image, no
// checkout code, a low absolute price, and a post from the last day are
// fixed ranking preferences that used to live only in the model prompt.
// A price the product page confirmed outranks every unconfirmed pick, so
// an unverified deal is never first when a verified one exists.
function rankScore(deal, now = Date.now()) {
  const velocity = typeof deal.voteVelocity === "number" ? deal.voteVelocity : 0;
  let tier = 0;
  if (deal.priceVerified === true) tier += 100000;
  if (typeof deal.discountPct === "number" && deal.discountPct >= config.minDiscountPct) tier += 10000;
  else if (deal.priceClaim) tier += 5000;
  if (isFreshPost(deal.pubDate, now)) tier += 1000;
  if (deal.image) tier += 100;
  if (!deal.requiresCode) tier += 50;
  if (typeof deal.currentPrice === "number" && deal.currentPrice < 30) tier += 25;
  return tier + velocity;
}

// Numbers come from the post text. Any price fields already sitting on the
// candidate (including anything a model might have attached) are replaced.
export function rankSlickdealsDeterministic(candidates, maxDeals = config.maxDealsPerDay, now = Date.now()) {
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

  parsed.sort((a, b) => rankScore(b, now) - rankScore(a, now));
  return promoteFeaturedPick(parsed.slice(0, maxDeals));
}

// Sort again after the live check. Verification can drop the previous
// leader, and a confirmed price has to move ahead of an unconfirmed one.
export function orderVerifiedDeals(deals, now = Date.now()) {
  const sorted = [...(deals || [])].sort((a, b) => rankScore(b, now) - rankScore(a, now));
  return promoteFeaturedPick(sorted);
}

export async function rankSlickdealsCandidates(candidates, maxDeals = config.maxDealsPerDay, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const poolSize = options.poolSize ?? Math.max(maxDeals * 3, maxDeals);
  const pool = rankSlickdealsDeterministic(candidates, poolSize, now.getTime());
  if (pool.length === 0) return [];

  const checked = await verifyDeals(pool, {
    ...options,
    now,
    onDrop(deal, reason) {
      console.warn(`[pipeline] Dropping ${deal.asin || deal.title || "deal"}: ${reason}`);
      if (options.onDrop) options.onDrop(deal, reason);
    },
  });
  const ranked = orderVerifiedDeals(checked, now.getTime()).slice(0, maxDeals);
  const verified = ranked.filter((deal) => deal.priceVerified === true).length;
  console.log(`[pipeline] ${ranked.length} pick(s) after the price check, ${verified} with a confirmed price.`);
  return addBlurbs(ranked);
}

// The featured card needs real discount evidence and, when any candidate
// has one, an image. Enforce that in code rather than hoping a ranking
// pass remembered.
function promoteFeaturedPick(deals) {
  if (deals.length === 0) return deals;

  // When any pick's price was confirmed, the featured slot stays inside
  // that set. An unconfirmed price never takes the top spot over one.
  const verifiedExists = deals.some((d) => d.priceVerified === true);
  const eligible = (d) => !verifiedExists || d.priceVerified === true;
  const hasEvidence = (d) =>
    (typeof d.discountPct === "number" && d.discountPct >= config.minDiscountPct) || Boolean(d.priceClaim);
  const hasImage = (d) => Boolean(d.image);

  let promoteIndex = deals.findIndex((d) => eligible(d) && hasEvidence(d) && hasImage(d));
  if (promoteIndex === -1) promoteIndex = deals.findIndex((d) => eligible(d) && hasImage(d));
  if (promoteIndex === -1) promoteIndex = deals.findIndex((d) => eligible(d) && hasEvidence(d));
  if (promoteIndex <= 0) return deals;

  const reordered = [...deals];
  const [promoted] = reordered.splice(promoteIndex, 1);
  reordered.unshift(promoted);
  return reordered;
}
