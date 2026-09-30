import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "./config.js";
import { fetchTrendingMock, fetchPriceHistoryMock } from "./sources/mock.js";
import { fetchManualCandidates } from "./sources/manual.js";
import { fetchSlickdealsCandidates } from "./sources/slickdeals.js";
import { fetchTrendingLive, fetchPriceHistoryLive } from "./sources/keepaLive.js";
import { findCandidates, findManualCandidates } from "./analyze.js";
import { rankCandidates } from "./rankWithClaude.js";
import { rankSlickdealsCandidates } from "./rankSlickdeals.js";
import { buildFeed } from "./buildFeed.js";
import { writeArchiveAndSitemap } from "./archive.js";
import { postToChannels } from "./notify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, "..", "..", "extension", "deals.json");

// Returns the final, ranked-and-blurbed deals ready for buildFeed().
// Each data source handles its own discovery + filtering + (usually) a
// separate Claude ranking pass — Slickdeals is the odd one out where
// ranking and price-extraction happen in the same Claude call, since the
// source data is free text rather than clean structured fields.
async function getRankedDeals() {
  if (config.dataSource === "slickdeals") {
    console.log("[pipeline] DATA_SOURCE=slickdeals — reading the public Slickdeals RSS feed.");
    const candidates = await fetchSlickdealsCandidates();
    console.log(`[pipeline] ${candidates.length} Amazon-linked post(s) found, asking Claude to pick + extract.`);
    return rankSlickdealsCandidates(candidates);
  }

  if (config.dataSource === "manual") {
    console.log("[pipeline] DATA_SOURCE=manual — reading pipeline/candidates.json.");
    const candidates = await fetchManualCandidates();
    const found = findManualCandidates({ candidates, config });
    console.log(
      `[pipeline] ${candidates.length} hand-picked candidate(s) -> ${found.length} pass the discount filter.`
    );
    return rankCandidates(found);
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
    return rankCandidates(found);
  }

  if (config.dataSource === "live") {
    const trending = await fetchTrendingLive(config.keepaApiKey);
    const asins = trending.map((t) => t.asin);
    const priceHistory = await fetchPriceHistoryLive(config.keepaApiKey, asins);
    const found = findCandidates({ trending, priceHistory, config });
    return rankCandidates(found);
  }

  throw new Error(
    `Unknown DATA_SOURCE "${config.dataSource}" (expected slickdeals, manual, mock, or live).`
  );
}

async function main() {
  const ranked = await getRankedDeals();

  if (ranked.length === 0) {
    console.warn("[pipeline] No qualifying deal found today. Writing an empty feed.");
    await fs.writeFile(outputPath, JSON.stringify(buildFeed([]), null, 2));
    return;
  }

  const feed = buildFeed(ranked);

  await fs.writeFile(outputPath, JSON.stringify(feed, null, 2));
  console.log(`[pipeline] Wrote ${ranked.length} deal(s) to ${outputPath}`);
  for (const deal of feed.deals) {
    console.log(`  - ${deal.title}: $${deal.price} (${deal.discountPct ?? "?"}% off) -> ${deal.url}`);
  }

  await writeArchiveAndSitemap(feed);
  await postToChannels(feed);
}

main().catch((err) => {
  console.error("[pipeline] Failed:", err);
  process.exitCode = 1;
});
