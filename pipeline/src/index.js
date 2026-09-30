import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "./config.js";
import { fetchTrendingMock, fetchPriceHistoryMock } from "./sources/mock.js";
import { fetchManualCandidates } from "./sources/manual.js";
import { fetchTrendingLive, fetchPriceHistoryLive } from "./sources/keepaLive.js";
import { findCandidates, findManualCandidates } from "./analyze.js";
import { rankCandidates } from "./rankWithClaude.js";
import { buildFeed } from "./buildFeed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, "..", "..", "extension", "deals.json");

async function findCandidatesForSource() {
  if (config.dataSource === "manual") {
    console.log("[pipeline] DATA_SOURCE=manual — reading pipeline/candidates.json.");
    const candidates = await fetchManualCandidates();
    const found = findManualCandidates({ candidates, config });
    console.log(
      `[pipeline] ${candidates.length} hand-picked candidate(s) -> ${found.length} pass the discount filter.`
    );
    return found;
  }

  if (config.dataSource === "mock") {
    console.log("[pipeline] DATA_SOURCE=mock — reading fixtures instead of calling Keepa.");
    const [trending, priceHistory] = await Promise.all([
      fetchTrendingMock(),
      fetchPriceHistoryMock(),
    ]);
    const found = findCandidates({ trending, priceHistory, config });
    console.log(
      `[pipeline] ${trending.length} trending candidates -> ${found.length} pass trend + discount filters.`
    );
    return found;
  }

  if (config.dataSource === "live") {
    const trending = await fetchTrendingLive(config.keepaApiKey);
    const asins = trending.map((t) => t.asin);
    const priceHistory = await fetchPriceHistoryLive(config.keepaApiKey, asins);
    return findCandidates({ trending, priceHistory, config });
  }

  throw new Error(`Unknown DATA_SOURCE "${config.dataSource}" (expected manual, mock, or live).`);
}

async function main() {
  const candidates = await findCandidatesForSource();

  if (candidates.length === 0) {
    console.warn("[pipeline] No candidates cleared the filter(s). Writing an empty feed.");
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
