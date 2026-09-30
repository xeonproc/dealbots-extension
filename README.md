# Dealbots — AI Deal of the Day

A Chrome extension that shows one AI-picked "deal of the day": a product
that's discounted vs. its usual price, with the pick and blurb written daily
by Claude. Live at:

- Extension: load unpacked from `extension/` (not yet published to the
  Chrome Web Store)
- Public feed: https://xeonproc.github.io/dealbots-extension/extension/deals.json

## How it works

```
pipeline/  (run manually for now, e.g. once a day)
  1. Get candidate products        -> sources/manual.js reads candidates.json (you fill this in by hand)
  2. Filter: discount >= threshold -> analyze.js
  3. Pick + write blurbs           -> rankWithClaude.js (Claude API)
  4. Write feed                    -> buildFeed.js -> extension/deals.json
  5. `git push`                    -> GitHub Pages republishes the feed

extension/  (Chrome Manifest V3 extension)
  popup.js fetches the live GitHub Pages feed (falls back to the bundled
  extension/deals.json if that's unreachable) and renders it.
  "Buy on Amazon" links already have ?tag=<AFFILIATE_TAG> appended.
```

The pipeline never runs inside the browser and the Anthropic API key never
ships in the extension — only your machine (or GitHub Actions, once that's
enabled) sees it. The extension itself just fetches a static JSON feed.

### Why "manual" candidates for now, instead of full automation?

The original plan was: an AI/API scours trending + discount data automatically.
In practice that requires either Amazon's own Product Advertising API (free,
but gated behind 3 qualifying sales through your Associates link in the last
180 days — not available on day one) or a paid third-party product-data API
like Keepa (cheapest plan is €49/month, no free tier). Scraping amazon.com
directly isn't an option — it violates Amazon's Conditions of Use and gets
detected/blocked regardless of who runs the scraper.

So for now: you browse Amazon's public Today's Deals / Best Sellers pages
yourself (exactly what a shopper does — no scraping involved), and log a few
candidates into `pipeline/candidates.json` with the price and Amazon's own
listed "was" price. Claude still does 100% of the ranking and blurb-writing,
and the tag-appending / feed-publishing is still fully automatic. Once you
clear 3 sales, switch `DATA_SOURCE=live` and Amazon's PA-API takes over
discovery for free — see `pipeline/src/sources/keepaLive.js` for where that
integration goes (despite the filename, PA-API can plug in there too).

## Status

- ✅ Extension UI (popup) — confirmed working, loaded unpacked in Chrome
- ✅ Manual-candidate pipeline (`DATA_SOURCE=manual`) — confirmed working end to end, including real Claude blurb generation
- ✅ Repo pushed to GitHub: https://github.com/xeonproc/dealbots-extension
- ✅ GitHub Pages serving the feed publicly
- ✅ `ANTHROPIC_API_KEY` set as a GitHub Actions repo secret, ready for later
- ⏳ Amazon PA-API / live Keepa integration (`pipeline/src/sources/keepaLive.js`) — stubbed, throws until implemented (blocked on 3 qualifying sales, or a paid Keepa plan)
- ⏳ GitHub Actions daily run — workflow pushed (`.github/workflows/daily-deals.yml`) but not enabled; running the pipeline and pushing is still manual
- ⏳ Chrome Web Store submission — not started

## Running the pipeline

Requires [Node.js](https://nodejs.org) 20+.

**Day to day (manual candidates, real Claude blurb):**

1. Browse Amazon's public Today's Deals / Best Sellers pages, pick 1+ products
2. Edit `pipeline/candidates.json` — `asin`, `title`, `category`, `image`, `currentPrice`, `listPrice` (Amazon's own listed price) for each
3. `cd pipeline && npm run build`
4. Check `extension/deals.json`, then `git add -A && git commit && git push` — GitHub Pages will pick it up within a few minutes

**Testing the pipeline logic itself (fake data, no API key, no candidates.json edits needed):**

```sh
cd pipeline
npm run build:mock
```

**Testing the extension UI:**

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/`
2. Click the extension icon — it fetches the live GitHub Pages feed (or the bundled `deals.json` if offline)
3. After changing `manifest.json`, click the reload icon on the extension card

## Next steps

1. Use the manual workflow above for real for a while — get to 3 Associates sales
2. Once eligible, implement Amazon PA-API (or a paid Keepa plan, if you'd rather pay than wait) in `pipeline/src/sources/keepaLive.js`, set `DATA_SOURCE=live`
3. Enable `.github/workflows/daily-deals.yml` (add `KEEPA_API_KEY` secret if using Keepa; `ANTHROPIC_API_KEY` is already set) and test via its manual `workflow_dispatch` trigger before trusting the daily cron
4. Only then prep the Chrome Web Store listing (icons, screenshots, privacy policy, store description) — see "Compliance notes" below first

## Compliance notes (read before submitting to the Chrome Web Store)

- **Amazon Associates**: appending `?tag=dealbots00-20` to a product URL
  needs no approval and is fine from day one. What needs care is *how the
  underlying price/deal data is sourced* — don't scrape amazon.com directly;
  use PA-API once eligible, a paid data API, or (current approach) your own
  manual browsing.
- **Price accuracy**: the Associates Operating Agreement requires displayed
  prices to be accurate/current. Since the feed is only as fresh as the last
  time you ran the pipeline, don't let `candidates.json` go stale — re-run
  before publishing a new day's pick.
- **Chrome Web Store review**: this extension intentionally uses no
  `host_permissions` beyond the feed URL and never modifies pages the user
  visits, which keeps the review surface small. You'll still need a privacy
  policy page and a store listing description before submitting.
