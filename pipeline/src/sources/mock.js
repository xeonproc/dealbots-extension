import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "..", "fixtures");

export async function fetchTrendingMock() {
  const raw = await fs.readFile(path.join(fixturesDir, "trending.json"), "utf-8");
  return JSON.parse(raw);
}

export async function fetchPriceHistoryMock() {
  const raw = await fs.readFile(path.join(fixturesDir, "priceHistory.json"), "utf-8");
  return JSON.parse(raw);
}
