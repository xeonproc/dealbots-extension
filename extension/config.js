// Where the popup fetches today's deal feed from.
//
// Primary: the public feed published by the daily pipeline via GitHub Pages.
// Fallback: the deals.json bundled inside the extension itself (written by
// `npm run build` / `npm run build:mock` in pipeline/), used when the remote
// feed is unreachable (offline dev, Pages not deployed yet, network hiccup).
export const REMOTE_FEED_URL = "https://xeonproc.github.io/dealbots-extension/extension/deals.json";
export const LOCAL_FEED_URL = "deals.json";

// The "see other deals" page — same GitHub Pages site, lists every deal from
// today's run (the popup only shows deals[0]).
export const MORE_DEALS_URL = "https://xeonproc.github.io/dealbots-extension/";

// Social channels the daily pipeline auto-posts to (see pipeline/src/notify.js).
// Linked from the popup/page so a one-time visitor can become a follower
// instead of a dead end — see README "Traffic strategy".
export const TELEGRAM_URL = "https://t.me/dealbotsai";
export const MASTODON_URL = "https://mastodon.social/@xeonproc";
