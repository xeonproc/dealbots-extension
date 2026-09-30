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
      requiresCode: d.requiresCode || false,
      blurb: d.blurb,
      url: buildAffiliateUrl(d.asin),
    })),
  };
}
