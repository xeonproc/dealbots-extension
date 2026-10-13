import { discountPctFromPrices } from "./validateDeal.js";

// Stage 1: is this product trending?
// Best Sellers Rank is "lower = more popular", so a product is trending
// when its rank drops (numerically) between the oldest and newest samples.
export function trendScore(rankHistory) {
  if (!rankHistory || rankHistory.length < 2) return 0;

  const sorted = [...rankHistory].sort((a, b) => b.daysAgo - a.daysAgo);
  const oldest = sorted[0].rank;
  const newest = sorted[sorted.length - 1].rank;

  if (oldest <= 0) return 0;
  return (oldest - newest) / oldest; // positive = improving/trending
}

// Stage 2: the "was" price is this product's own 90-day average, not a
// vendor's claimed list price. The published percent is computed from that
// rounded price in validateDeal.js so it cannot drift from the feed.
export function baselinePrice(priceHistory90d) {
  return (
    priceHistory90d.reduce((sum, p) => sum + p, 0) / priceHistory90d.length
  );
}

// Manual-curation mode: you already did the "trending" discovery yourself
// (browsing Amazon's public Today's Deals / Best Sellers pages), and you're
// reporting the price + Amazon's own listed "was" price directly — no
// Keepa/PA-API history lookup needed. Still enforces the discount floor so
// a weak "deal" doesn't slip through just because it was hand-picked.
export function findManualCandidates({ candidates, config }) {
  return candidates
    .map((c) => {
      // A hand-entered "was" price is not a price-history check.
      const discount = discountPctFromPrices(c.currentPrice, c.listPrice);
      if (discount == null) return null;
      return { ...c, discountPct: discount, priceHistoryChecked: false };
    })
    .filter(Boolean)
    .filter((c) => c.discountPct >= config.minDiscountPct)
    .sort((a, b) => b.discountPct - a.discountPct);
}

export function findCandidates({ trending, priceHistory, config }) {
  return trending
    .map((product) => {
      const trend = trendScore(product.rankHistory);
      const history = priceHistory[product.asin];
      if (!history) return null;

      const listPrice = Math.round(baselinePrice(history.priceHistory90d) * 100) / 100;
      // Recompute from the rounded was-price so the stored triple always
      // satisfies dealNumberError. The history itself is the verdict.
      const discount = discountPctFromPrices(history.currentPrice, listPrice);
      if (discount == null) return null;

      return {
        ...product,
        trendScore: trend,
        currentPrice: history.currentPrice,
        listPrice,
        discountPct: discount,
        priceHistoryChecked: true,
      };
    })
    .filter(Boolean)
    .filter((c) => c.trendScore >= config.trendingRankImprovementPct)
    .filter((c) => c.discountPct >= config.minDiscountPct)
    .sort((a, b) => b.discountPct - a.discountPct);
}
