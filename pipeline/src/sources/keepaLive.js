// Real Keepa-backed data sources. Not implemented yet — wire these up once
// you have a Keepa API key (https://keepa.com/#!api).
//
// Keepa's "Best Sellers" / category rank endpoints give Best-Sellers-Rank
// history per ASIN, which is what fetchTrending() should turn into the same
// shape mock.js produces: [{ asin, title, category, image, rankHistory }].
//
// Keepa's product endpoint (?domain=1&asin=...&history=1) returns price
// history arrays (Amazon price, New price, etc.) which fetchPriceHistory()
// should turn into { [asin]: { currentPrice, priceHistory90d } }.
//
// See https://keepa.com/#!discuss/t/request-products/109 for request shape.

export async function fetchTrendingLive(_apiKey) {
  throw new Error(
    "fetchTrendingLive() is not implemented yet. Add your Keepa Best Sellers / " +
      "Movers & Shakers request here, or set USE_MOCK_DATA=true to use fixtures."
  );
}

export async function fetchPriceHistoryLive(_apiKey, _asins) {
  throw new Error(
    "fetchPriceHistoryLive() is not implemented yet. Add your Keepa product/price " +
      "history request here, or set USE_MOCK_DATA=true to use fixtures."
  );
}
