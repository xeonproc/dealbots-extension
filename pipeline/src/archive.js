import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const archiveDir = path.join(repoRoot, "deals");
const siteOrigin = "https://xeonproc.github.io/dealbots-extension";

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(v) {
  return typeof v === "number" ? `$${v.toFixed(2)}` : v;
}

function cardHTML(deal, featured) {
  const discount = deal.discountPct
    ? `<span class="discount-badge">🔥 ${deal.discountPct}% OFF</span>`
    : "";
  const listPrice = deal.listPrice
    ? `<span class="list-price">${money(deal.listPrice)}</span>`
    : "";
  const codeBadge = deal.requiresCode
    ? `<span class="code-badge">🎟️ Code required at checkout</span>`
    : "";
  const flag = featured ? `<div class="featured-flag">⭐ Today's Pick</div>` : "";

  return `
    <article class="card${featured ? " featured" : ""}">
      ${flag}
      <div class="card-image-wrap"><img src="${deal.image || ""}" alt="" loading="lazy" referrerpolicy="no-referrer" /></div>
      <div class="card-body">
        <h3 class="card-title">${escapeHTML(deal.title || "Untitled product")}</h3>
        <p class="card-blurb">${escapeHTML(deal.blurb || "")}</p>
        <div class="price-row">
          <span class="price">${money(deal.price)}</span>
          ${listPrice}
        </div>
        ${discount}
        ${codeBadge}
        <a class="buy-btn" href="${deal.url}" target="_blank" rel="noopener noreferrer">Buy Now →</a>
      </div>
    </article>
  `;
}

function flameSVG() {
  return `<svg class="flame-icon" viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <linearGradient id="flameGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop class="g1" offset="0%" />
        <stop class="g2" offset="55%" />
        <stop class="g3" offset="100%" />
      </linearGradient>
    </defs>
    <path fill="url(#flameGrad)" fill-rule="evenodd" clip-rule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1.005a.75.75 0 0 0 .582-.185.75.75 0 0 0 .249-.585 2.24 2.24 0 0 1-.207-.892 2.25 2.25 0 0 1 .997-1.982c.166.463.42.898.75 1.243A2.25 2.25 0 0 1 15.75 14.25Z" />
  </svg>`;
}

// Archive pages embed the day's data directly in the markup (not fetched via
// JS like index.html's "live" view) so search crawlers see real content
// without needing to execute JavaScript, and so an old page keeps showing
// its own day's deals forever even if deals.json's shape changes later.
function renderArchivePageHTML(feed, dateStr) {
  const topTitle = feed.deals[0]?.title || "today's deals";
  const pageTitle = `Deal of the Day — ${dateStr}: ${topTitle} | Dealbots`;
  const description = feed.deals[0]?.blurb || `AI-picked deals from ${dateStr}.`;
  const ogImage = feed.deals[0]?.image || "";
  const canonical = `${siteOrigin}/deals/${dateStr}.html`;

  const cards = feed.deals.map((deal, i) => cardHTML(deal, i === 0)).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHTML(pageTitle)}</title>
<meta name="description" content="${escapeHTML(description)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHTML(pageTitle)}" />
<meta property="og:description" content="${escapeHTML(description)}" />
${ogImage ? `<meta property="og:image" content="${escapeHTML(ogImage)}" />` : ""}
<meta property="og:url" content="${canonical}" />
<link rel="stylesheet" href="../assets/deals.css" />
</head>
<body>

<header>
  <h1>${flameSVG()} <span class="gradient-text">Deals — ${dateStr}</span></h1>
  <p>AI-picked deals from this day's run.</p>
  <div class="generated-badge">${dateStr}</div>
</header>

<p class="archive-note"><a href="../index.html">← See today's live deals</a></p>

<main>
  <div class="grid">${cards}</div>
</main>

<footer>
  Prices and availability change fast — always confirm at checkout.
  Some links include an affiliate tag.
</footer>

</body>
</html>
`;
}

async function listArchiveDates() {
  try {
    const files = await fs.readdir(archiveDir);
    return files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
      .map((f) => f.replace(".html", ""))
      .sort();
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeSitemap(dates) {
  const staticUrls = [
    { loc: `${siteOrigin}/`, changefreq: "daily" },
    { loc: `${siteOrigin}/privacy.html`, changefreq: "yearly" },
  ];
  const archiveUrls = dates.map((d) => ({
    loc: `${siteOrigin}/deals/${d}.html`,
    lastmod: d,
    changefreq: "never",
  }));

  const urls = [...staticUrls, ...archiveUrls]
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  await fs.writeFile(path.join(repoRoot, "sitemap.xml"), xml);
}

async function writeRobotsTxt() {
  const contents = `User-agent: *
Allow: /

Sitemap: ${siteOrigin}/sitemap.xml
`;
  await fs.writeFile(path.join(repoRoot, "robots.txt"), contents);
}

// Called once per pipeline run. Writes today's permanent archive page,
// regenerates sitemap.xml from every archive page that's ever been created,
// and ensures robots.txt points at it. Skipped entirely on empty-feed days
// (nothing to archive).
export async function writeArchiveAndSitemap(feed) {
  if (!feed.deals || feed.deals.length === 0) {
    console.log("[archive] Empty feed, skipping archive page for today.");
    return;
  }

  const dateStr = feed.generatedAt.slice(0, 10);
  await fs.mkdir(archiveDir, { recursive: true });

  const html = renderArchivePageHTML(feed, dateStr);
  await fs.writeFile(path.join(archiveDir, `${dateStr}.html`), html);
  console.log(`[archive] Wrote deals/${dateStr}.html`);

  const dates = await listArchiveDates();
  await writeSitemap(dates);
  await writeRobotsTxt();
  console.log(`[archive] Regenerated sitemap.xml (${dates.length} archive page(s)) and robots.txt`);
}
