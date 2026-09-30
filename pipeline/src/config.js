export const config = {
  // "slickdeals" - fully automated (default): reads Slickdeals' public RSS
  //                feed, Claude picks + extracts price + writes the blurb
  // "manual"     - read pipeline/candidates.json, which you fill in by hand
  // "mock"       - read pipeline/fixtures/*.json (for testing the pipeline
  //                itself, not real deals)
  // "live"       - call sources/keepaLive.js (not implemented yet, requires
  //                a paid Keepa plan or a PA-API-eligible Associates account)
  dataSource: process.env.DATA_SOURCE || "slickdeals",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  // Task is bounded extraction + ranking from short text, not open-ended
  // reasoning — well within Haiku's range, and ~2x cheaper than Sonnet 5.
  // Revert to "claude-sonnet-5" if picks start looking worse.
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
  // Only needed if ANTHROPIC_API_KEY is an org-level key not scoped to a
  // workspace (Console error: "not scoped to a workspace"). Prefer creating
  // a workspace-scoped key instead, which needs no extra header.
  anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID || "",
  keepaApiKey: process.env.KEEPA_API_KEY || "",

  affiliateTag: process.env.AFFILIATE_TAG || "dealbots00-20",

  // A product counts as "trending" if its Best Sellers Rank improved
  // (got numerically lower = more popular) by at least this fraction
  // between the oldest and newest rankHistory samples.
  trendingRankImprovementPct: Number(process.env.TRENDING_RANK_IMPROVEMENT_PCT || 0.3),

  // A trending product only qualifies as a "deal" if it's discounted at
  // least this much vs. its own 90-day average price.
  minDiscountPct: Number(process.env.MIN_DISCOUNT_PCT || 20),

  // deals[0] is the extension's featured pick; the rest populate the "see
  // other deals" page — same daily Claude call powers both surfaces.
  maxDealsPerDay: Number(process.env.MAX_DEALS_PER_DAY || 8),
};
