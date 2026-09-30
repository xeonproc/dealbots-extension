import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const candidatesPath = path.join(__dirname, "..", "..", "candidates.json");

// You fill this file in by hand each day (browsing Amazon's public Today's
// Deals / Best Sellers pages yourself) — see pipeline/candidates.json.
export async function fetchManualCandidates() {
  const raw = await fs.readFile(candidatesPath, "utf-8");
  const candidates = JSON.parse(raw);

  if (!Array.isArray(candidates)) {
    throw new Error(`${candidatesPath} must contain a JSON array of candidates.`);
  }

  return candidates;
}
