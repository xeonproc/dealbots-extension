import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addBlurbs } from "./rankWithClaude.js";

// Prints blurbs for deals already in a feed file. Does not rank, scrape,
// rewrite deals.json, archive, or post. Defaults to the current feed and
// the first few picks.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const feedPath = process.argv[2] || path.join(__dirname, "..", "..", "extension", "deals.json");
const limit = Number(process.argv[3] || 4);

const feed = JSON.parse(await fs.readFile(feedPath, "utf8"));
const deals = (feed.deals || []).slice(0, limit).map((d) => ({
  ...d,
  currentPrice: d.currentPrice ?? d.price,
}));

const blurred = await addBlurbs(deals);
for (const deal of blurred) {
  console.log("---");
  console.log(deal.title);
  console.log(deal.blurb);
}
