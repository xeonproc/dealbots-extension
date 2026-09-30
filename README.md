# Dealbots — AI Deal of the Day

A Chrome extension that shows one AI-picked "deal of the day": a product that's
both **trending** (rising Amazon Best Sellers Rank) and **genuinely
discounted** (vs. its own price history, not an inflated "was" price).

## How it works

```
pipeline/  (runs once a day, e.g. via GitHub Actions)
  1. Fetch trending candidates       -> sources/keepaLive.js (or mock.js for testing)
  2. Fetch price history for those   -> sources/keepaLive.js (or mock.js for testing)
  3. Filter: trending AND discounted -> analyze.js
  4. Pick + write blurbs              -> rankWithClaude.js (Claude API)
  5. Write feed                       -> buildFeed.js -> extension/deals.json

extension/  (Chrome Manifest V3 extension)
  popup.js fetches deals.json (config.js FEED_URL) and renders it.
  "Buy on Amazon" links already have ?tag=<AFFILIATE_TAG> appended.
```

The pipeline never runs inside the browser and the Anthropic/Keepa API keys
never ship in the extension — only the extension developer's machine or
GitHub Actions sees them. The extension itself just fetches a static JSON
feed.

## Status

- ✅ Extension UI (popup) — works today against mock data
- ✅ Pipeline scoring logic (trend filter, discount filter, feed builder) — works today against mock data
- ⏳ Real Keepa integration (`pipeline/src/sources/keepaLive.js`) — stubbed, throws until implemented (needs a Keepa API key)
- ⏳ GitHub Pages hosting for the public feed — not yet configured
- ⏳ GitHub Actions daily run — workflow drafted (`.github/workflows/daily-deals.yml`) but not enabled/tested

## Local testing (no API keys needed)

Requires [Node.js](https://nodejs.org) 20+ (not currently installed on this
machine — install it first).

```sh
cd pipeline
npm run build:mock
```

This reads `pipeline/fixtures/trending.json` + `priceHistory.json` (fake
Keepa-shaped data), runs the trend/discount filters, and writes
`extension/deals.json`. Since no `ANTHROPIC_API_KEY` is set, it uses a
plain-template blurb instead of calling Claude — the rest of the pipeline
still runs for real.

Then load the extension in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**, select the `extension/` folder
4. Click the extension icon — it should show the mock "Anker 737 Power Bank" deal

## Testing with a real Claude API key (still mock trend/price data)

```sh
cd pipeline
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...
npm run build
```

This keeps `USE_MOCK_DATA=true` (default) for trend/price data but calls the
real Claude API to write the blurb — good for testing the Claude integration
in isolation before Keepa is wired up.

## Next steps (once local testing looks right)

1. Sign up for a [Keepa API key](https://keepa.com/#!api) and implement
   `fetchTrendingLive` / `fetchPriceHistoryLive` in
   `pipeline/src/sources/keepaLive.js`
2. Set `USE_MOCK_DATA=false` and re-test locally end-to-end
3. Push this repo to GitHub, add `ANTHROPIC_API_KEY` and `KEEPA_API_KEY` as
   repo secrets (Settings → Secrets and variables → Actions)
4. Configure GitHub Pages to serve `extension/deals.json` publicly, and
   update `extension/config.js`'s `FEED_URL` to that URL (plus add it to
   `host_permissions` in `manifest.json`)
5. Enable the `daily-deals.yml` workflow (currently a draft) and test it via
   its manual `workflow_dispatch` trigger before trusting the daily cron
6. Only then prep the Chrome Web Store listing (icons, screenshots, privacy
   policy, store description) — see the "Compliance notes" below first

## Compliance notes (read before submitting to the Chrome Web Store)

- **Amazon Associates**: appending `?tag=dealbots00-20` to a product URL
  needs no approval and is fine from day one. What needs care is *how the
  underlying price/deal data is sourced* — do not scrape amazon.com
  directly; use Keepa (or another paid product-data API) or Amazon's own
  PA-API once you qualify (3 sales in 180 days).
- **Price accuracy**: the Associates Operating Agreement requires displayed
  prices to be accurate/current. Don't let the feed go stale — the daily
  cron re-fetches everything from scratch, so just make sure it's actually
  running.
- **Chrome Web Store review**: this extension intentionally uses no
  `host_permissions` beyond the feed URL and never modifies pages the user
  visits, which keeps the review surface small. You'll still need a privacy
  policy page and a store listing description before submitting.
