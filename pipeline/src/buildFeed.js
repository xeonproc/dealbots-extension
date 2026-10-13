import { config } from "./config.js";

export function buildAffiliateUrl(asin) {
  return `https://www.amazon.com/dp/${asin}?tag=${config.affiliateTag}`;
}

export function buildFeed(rankedDeals, { paused = false, now = new Date() } = {}) {
  const generatedAt = now.toISOString();

  // paused AND an empty list: the extension already in the store only
  // understands the empty list. The flag is for builds that read it.
  if (paused) {
    return { generatedAt, paused: true, deals: [] };
  }

  const pickedOn = generatedAt.slice(0, 10);

  return {
    generatedAt,
    paused: false,
    deals: rankedDeals.map((d) => ({
      asin: d.asin,
      title: d.title,
      image: d.image,
      price: d.currentPrice ?? d.price,
      listPrice: d.listPrice ?? null,
      discountPct: d.discountPct ?? null,
      priceClaim: d.priceClaim || null,
      priceHistoryChecked: d.priceHistoryChecked === true,
      // Fallback badge for items with zero price evidence of any kind —
      // grounded in real community engagement (upvotes/hour > 0), never
      // shown just because an item lacks a discount claim. Only set when
      // there's nothing stronger to show.
      trending: !d.discountPct && !d.priceClaim && typeof d.voteVelocity === "number" && d.voteVelocity > 0,
      requiresCode: d.requiresCode || false,
      blurb: d.blurb,
      pickedOn,
      url: buildAffiliateUrl(d.asin),
    })),
  };
}
