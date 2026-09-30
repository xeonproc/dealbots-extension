// Where the popup fetches today's deal feed from.
//
// Local/dev default: the deals.json bundled inside the extension itself
// (written by pipeline/src/index.js -> ../extension/deals.json).
//
// Once the daily pipeline is publishing to GitHub Pages, switch this to
// that public URL, e.g.:
//   const FEED_URL = "https://<your-username>.github.io/dealbots-extension/deals.json";
// and add that origin to "host_permissions" in manifest.json.
const FEED_URL = "deals.json";
