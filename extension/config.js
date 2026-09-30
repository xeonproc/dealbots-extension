// Where the popup fetches today's deal feed from.
//
// Primary: the public feed published by the daily pipeline via GitHub Pages.
// Fallback: the deals.json bundled inside the extension itself (written by
// `npm run build` / `npm run build:mock` in pipeline/), used when the remote
// feed is unreachable (offline dev, Pages not deployed yet, network hiccup).
const REMOTE_FEED_URL = "https://xeonproc.github.io/dealbots-extension/extension/deals.json";
const LOCAL_FEED_URL = "deals.json";

// The "see other deals" page — same GitHub Pages site, lists every deal from
// today's run (the popup only shows deals[0]).
const MORE_DEALS_URL = "https://xeonproc.github.io/dealbots-extension/";
