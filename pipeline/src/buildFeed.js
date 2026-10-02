import { config } from "./config.js";

export function buildAffiliateUrl(asin) {
  return `https://www.amazon.com/dp/${asin}?tag=${config.affiliateTag}`;
}

export function buildFeed(rankedDeals) {
  return {
    generatedAt: new Date().toISOString(),
    deals: rankedDeals.map((d) => ({
      asin: d.asin,
      title: d.title,
      image: d.image,
      price: d.currentPrice,
      listPrice: d.listPrice,
      discountPct: d.discountPct,
      priceClaim: d.priceClaim || null,
      // Fallback badge for items with zero price evidence of any kind —
      // grounded in real community engagement (upvotes/hour > 0), never
      // shown just because an item lacks a discount claim. Only set when
      // there's nothing stronger to show.
      trending: !d.discountPct && !d.priceClaim && typeof d.voteVelocity === "number" && d.voteVelocity > 0,
      requiresCode: d.requiresCode || false,
      blurb: d.blurb,
      url: buildAffiliateUrl(d.asin),
    })),
  };
}
