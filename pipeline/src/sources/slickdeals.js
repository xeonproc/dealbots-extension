// Slickdeals publishes an official public RSS feed of their "Hot Deals"
// forum — this is RSS, a syndication format meant for programmatic
// consumption, not a scrape of rendered HTML. Each post that links to
// Amazon carries the ASIN in a data attribute plus a community "Thumb
// Score" (their own deal-quality signal), which stands in for the
// trending/validation step Keepa/PA-API would otherwise provide.
//
// Note: the Amazon links in this feed carry Slickdeals' own affiliate tag.
// This pipeline extracts only the ASIN and rebuilds the URL with our own
// tag (see buildFeed.js) rather than reusing their link as-is.
const RSS_URL = "https://slickdeals.net/newsearch.php?rss=1&forumchoice%5B%5D=9";

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  if (!match) return "";
  return match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Raw thumbScore is a snapshot ("how many upvotes so far"), not a trend —
// a post up for 2 days with 5 votes and one up for 1 hour with 5 votes look
// identical by that measure, even though the second is climbing much
// faster. Votes-per-hour-since-posted approximates actual velocity instead.
// Clamp the age floor so a post that's only minutes old doesn't produce a
// wildly inflated ratio from near-zero elapsed time.
const MIN_AGE_HOURS = 0.25;

function voteVelocity(thumbScore, pubDate) {
  const posted = new Date(pubDate);
  if (Number.isNaN(posted.getTime())) return thumbScore;

  const ageHours = Math.max(MIN_AGE_HOURS, (Date.now() - posted.getTime()) / 36e5);
  return Math.round((thumbScore / ageHours) * 100) / 100;
}

function parseItem(itemXml) {
  const title = decodeEntities(extractTag(itemXml, "title"));
  const link = extractTag(itemXml, "link");
  const pubDate = extractTag(itemXml, "pubDate");
  const body = extractTag(itemXml, "content:encoded") || extractTag(itemXml, "description");

  const asinMatch = body.match(/data-aps-asin="([A-Z0-9]{10})"/);
  const storeMatch = body.match(/data-store-slug="([a-z0-9-]+)"/);
  const thumbMatch = body.match(/Thumb Score:\s*([+-]?\d+)/);
  const imgMatch = body.match(/<img[^>]+src="([^"]+)"/);

  if (!asinMatch || storeMatch?.[1] !== "amazon") return null;

  const thumbScore = thumbMatch ? Number(thumbMatch[1]) : 0;

  return {
    asin: asinMatch[1],
    title,
    sourceLink: link,
    image: imgMatch ? imgMatch[1] : "",
    thumbScore,
    pubDate,
    voteVelocity: voteVelocity(thumbScore, pubDate),
    rawText: decodeEntities(stripTags(body)).slice(0, 600),
  };
}

export async function fetchSlickdealsCandidates() {
  const res = await fetch(RSS_URL, {
    headers: {
      "user-agent": "dealbots-pipeline/0.1 (+https://github.com/xeonproc/dealbots-extension)",
    },
  });

  if (!res.ok) {
    throw new Error(`Slickdeals RSS request failed: ${res.status}`);
  }

  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);

  return items
    .map(parseItem)
    .filter(Boolean)
    .sort((a, b) => b.voteVelocity - a.voteVelocity);
}
