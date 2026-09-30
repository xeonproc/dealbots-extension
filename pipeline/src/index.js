import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "./config.js";
import { fetchTrendingMock, fetchPriceHistoryMock } from "./sources/mock.js";
import { fetchTrendingLive, fetchPriceHistoryLive } from "./sources/keepaLive.js";
import { findCandidates } from "./analyze.js";
import { rankCandidates } from "./rankWithClaude.js";
import { buildFeed } from "./buildFeed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, "..", "..", "extension", "deals.json");

async function loadData() {
  if (config.useMock) {
    console.log("[pipeline] USE_MOCK_DATA=true — reading fixtures instead of calling Keepa.");
    const [trending, priceHistory] = await Promise.all([
      fetchTrendingMock(),
      fetchPriceHistoryMock(),
    ]);
    return { trending, priceHistory };
  }

  const trending = await fetchTrendingLive(config.keepaApiKey);
  const asins = trending.map((t) => t.asin);
  const priceHistory = await fetchPriceHistoryLive(config.keepaApiKey, asins);
  return { trending, priceHistory };
}

async function main() {
  const { trending, priceHistory } = await loadData();

  const candidates = findCandidates({ trending, priceHistory, config });
  console.log(
    `[pipeline] ${trending.length} trending candidates -> ${candidates.length} pass trend + discount filters.`
  );

  if (candidates.length === 0) {
    console.warn("[pipeline] No candidates cleared both filters. Writing an empty feed.");
    await fs.writeFile(outputPath, JSON.stringify(buildFeed([]), null, 2));
    return;
  }

  const ranked = await rankCandidates(candidates);
  const feed = buildFeed(ranked);

  await fs.writeFile(outputPath, JSON.stringify(feed, null, 2));
  console.log(`[pipeline] Wrote ${ranked.length} deal(s) to ${outputPath}`);
  for (const deal of feed.deals) {
    console.log(`  - ${deal.title}: $${deal.price} (${deal.discountPct}% off) -> ${deal.url}`);
  }
}

main().catch((err) => {
  console.error("[pipeline] Failed:", err);
  process.exitCode = 1;
});
