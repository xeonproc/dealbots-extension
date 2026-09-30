# Dealbots — AI Deal of the Day

A Chrome extension that shows one AI-picked "deal of the day," found and
written fully automatically by Claude — plus a "see other deals" page with
the rest of the day's picks. Live at:

- Extension: load unpacked from `extension/` (not yet published to the
  Chrome Web Store)
- Deals page: https://xeonproc.github.io/dealbots-extension/
- Public feed: https://xeonproc.github.io/dealbots-extension/extension/deals.json

## How it works

```
pipeline/  (run daily, e.g. via GitHub Actions)
  1. Fetch candidate posts        -> sources/slickdeals.js (Slickdeals' public RSS feed)
  2. Pick + extract price + blurb -> rankSlickdeals.js (Claude API, one call returns up to 8 ranked picks)
  3. Write feed                   -> buildFeed.js -> extension/deals.json
  4. `git push`                   -> GitHub Pages republishes both the feed and the deals page

extension/  (Chrome Manifest V3 extension)
  popup.js fetches the live GitHub Pages feed (falls back to the bundled
  extension/deals.json if that's unreachable) and renders only deals[0] —
  the featured pick — plus a "See other deals" link to the deals page.
  "Buy Now" links already have ?tag=<AFFILIATE_TAG> appended.

index.html  (GitHub Pages root, .nojekyll — served directly, not via Jekyll)
  Reads the same deals.json and renders every pick from today's run as a
  card grid, with deals[0] called out as "Today's Pick".
```

The pipeline never runs inside the browser and the Anthropic API key never
ships in the extension — only your machine (or GitHub Actions, once that's
enabled) sees it. The extension itself just fetches a static JSON feed.

### Why Slickdeals' RSS feed instead of Keepa or Amazon PA-API?

The original plan was Amazon's own Product Advertising API, but that's
gated behind 3 qualifying sales through your Associates link in the last
180 days — not available on day one. Keepa (a paid alternative) has no free
tier (cheapest plan is €49/month). Scraping amazon.com directly isn't an
option — it violates Amazon's Conditions of Use.

Slickdeals publishes an **official public RSS feed** of their Hot Deals
forum — RSS is a syndication format meant for exactly this kind of
programmatic consumption, so it's not a scrape. Posts that link to Amazon
carry the ASIN directly, and the community's "Thumb Score" is a real,
human-validated "this is a genuinely good deal" signal — arguably better
for this purpose than Google Trends, since it's shopping-specific.

One thing worth knowing: those Amazon links in the RSS feed carry
Slickdeals' own affiliate tag. The pipeline extracts only the ASIN and
rebuilds the URL with `AFFILIATE_TAG` instead of reusing their link — so
the commission that click would've earned Slickdeals goes to you instead.
That's a deliberate tradeoff accepted for now; switch `DATA_SOURCE=live`
(Amazon PA-API) once you qualify, and this goes away entirely.

Because Slickdeals posts are free text ("$45.99 after promo code X", "was
$80 now $45", etc.), there's no clean structured price field to parse with
a regex — `rankSlickdeals.js` has Claude read each post directly, skip ones
where the price isn't clearly actionable (needs a coupon, membership, etc.),
and extract `currentPrice` / `listPrice` / `discountPct` (when statable)
alongside the blurb, all in one call.

## Status

- ✅ Extension UI (popup) — confirmed working, loaded unpacked in Chrome
- ✅ Fully automated pipeline (`DATA_SOURCE=slickdeals`, the default) — confirmed working end to end against the live Slickdeals feed and real Claude API, now returning up to 8 ranked picks per run
- ✅ Running on Claude Haiku 4.5 (switched from Sonnet 5 — quality-checked side by side on live data first; ~2x cheaper, and at this volume both cost cents/month regardless)
- ✅ "See other deals" page (`index.html`, GitHub Pages root) — colorful card grid of every pick, confirmed working including product images (needed `referrerpolicy="no-referrer"` — Slickdeals' image CDN blocks cross-origin embeds by Referer header otherwise)
- ✅ Repo pushed to GitHub: https://github.com/xeonproc/dealbots-extension
- ✅ GitHub Pages serving both the feed and the deals page publicly
- ✅ `ANTHROPIC_API_KEY` set as a GitHub Actions repo secret, ready for later
- ⏳ Amazon PA-API integration (`pipeline/src/sources/keepaLive.js`) — stubbed, throws until implemented (blocked on 3 qualifying sales)
- ✅ GitHub Actions daily workflow (`.github/workflows/daily-deals.yml`) updated for `DATA_SOURCE=slickdeals`, ready to test via manual `workflow_dispatch`
- ⏳ Chrome Web Store submission — not started

**Gotcha worth knowing if defaults ever seem ignored:** `pipeline/.env` overrides
`pipeline/src/config.js` defaults for anything it sets, even a var the code
no longer expects you to set. This bit us once — `.env` had `ANTHROPIC_MODEL`
and `MAX_DEALS_PER_DAY` hardcoded from early setup, which silently overrode
later default changes in `config.js` for both. If a code default change
doesn't seem to take effect, check `.env` first.

## Running the pipeline

Requires [Node.js](https://nodejs.org) 20+.

**Day to day (fully automatic):**

```sh
cd pipeline
npm run build
git add -A && git commit -m "deal: <date>" && git push
```

That's it — no candidate list to edit. GitHub Pages picks up the push within a few minutes.

**Testing the pipeline logic itself (fake data, no API key, no network calls):**

```sh
cd pipeline
npm run build:mock
```

**Manual-candidate mode** (`pipeline/candidates.json`, `DATA_SOURCE=manual`)
still exists as a fallback if the Slickdeals feed is ever down or you want
to hand-pick a specific deal for a day — see git history for how it worked.

**Testing the extension UI:**

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/`
2. Click the extension icon — it fetches the live GitHub Pages feed (or the bundled `deals.json` if offline)
3. After changing `manifest.json`, click the reload icon on the extension card

## Next steps

1. Test the daily workflow via its manual `workflow_dispatch` trigger (Actions tab → "Update daily deal feed" → Run workflow) before trusting the scheduled cron
2. Use the product for real for a while — get to 3 Associates sales
3. Once eligible, implement Amazon PA-API in `pipeline/src/sources/keepaLive.js`, set `DATA_SOURCE=live`, and the Slickdeals-affiliate-tag tradeoff above goes away
4. Prep the Chrome Web Store listing (icons, screenshots, privacy policy, store description) — see "Compliance notes" below first

## Compliance notes (read before submitting to the Chrome Web Store)

- **Amazon Associates**: appending `?tag=dealbots00-20` to a product URL
  needs no approval and is fine from day one.
- **Slickdeals RSS reuse**: see "Why Slickdeals' RSS feed" above — using
  their official RSS feed isn't scraping, but rebuilding the affiliate link
  with a different tag is a deliberate, accepted tradeoff, not something
  verified against Slickdeals' Terms of Service. Worth revisiting before
  treating this as permanent rather than a bootstrap step.
- **Price accuracy**: the Associates Operating Agreement requires displayed
  prices to be accurate/current. Since the feed is only as fresh as the
  last pipeline run, don't let it go stale — re-run at least daily.
- **Chrome Web Store review**: this extension intentionally uses no
  `host_permissions` beyond the feed URL and never modifies pages the user
  visits, which keeps the review surface small. You'll still need a privacy
  policy page and a store listing description before submitting.
