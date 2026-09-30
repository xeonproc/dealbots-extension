export const config = {
  // Defaults to mock fixture data. Set USE_MOCK_DATA=false once real
  // KEEPA_API_KEY / ANTHROPIC_API_KEY are wired up in sources/keepa*.js.
  useMock: process.env.USE_MOCK_DATA !== "false",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
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

  maxDealsPerDay: Number(process.env.MAX_DEALS_PER_DAY || 1),
};
