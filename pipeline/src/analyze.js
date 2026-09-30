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

// Stage 2: is the current price a genuine discount vs. its own history?
// (Not a vendor's claimed "list price" — the actual 90-day average.)
export function discountPct(currentPrice, priceHistory90d) {
  if (!priceHistory90d || priceHistory90d.length === 0) return 0;

  const baseline =
    priceHistory90d.reduce((sum, p) => sum + p, 0) / priceHistory90d.length;

  if (baseline <= 0) return 0;
  return Math.round(((baseline - currentPrice) / baseline) * 100);
}

export function baselinePrice(priceHistory90d) {
  return (
    priceHistory90d.reduce((sum, p) => sum + p, 0) / priceHistory90d.length
  );
}

export function findCandidates({ trending, priceHistory, config }) {
  return trending
    .map((product) => {
      const trend = trendScore(product.rankHistory);
      const history = priceHistory[product.asin];
      if (!history) return null;

      const discount = discountPct(history.currentPrice, history.priceHistory90d);

      return {
        ...product,
        trendScore: trend,
        currentPrice: history.currentPrice,
        listPrice: Math.round(baselinePrice(history.priceHistory90d) * 100) / 100,
        discountPct: discount,
      };
    })
    .filter(Boolean)
    .filter((c) => c.trendScore >= config.trendingRankImprovementPct)
    .filter((c) => c.discountPct >= config.minDiscountPct)
    .sort((a, b) => b.discountPct - a.discountPct);
}
