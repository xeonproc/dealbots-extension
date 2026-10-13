import {
  isFeedStale,
  formatUtcDate,
  feedHasNoPick,
  verifiedOffer,
  showPriceHistory,
} from "./feed-status.js";
import {
  REMOTE_FEED_URL,
  LOCAL_FEED_URL,
  MORE_DEALS_URL,
  TELEGRAM_URL,
  MASTODON_URL,
} from "./config.js";

const statusEl = document.getElementById("status");
const contentEl = document.getElementById("content");
const dateEl = document.getElementById("date");
const headingEl = document.getElementById("heading");
const staleEl = document.getElementById("stale-notice");
const sourceNoteEl = document.getElementById("source-note");
const template = document.getElementById("deal-template");

function formatPrice(value) {
  return typeof value === "number" ? `$${value.toFixed(2)}` : value;
}

function renderDeal(deal) {
  const node = template.content.cloneNode(true);

  const img = node.querySelector(".deal-image");
  // No image in the feed, or one that fails to load: drop the element
  // rather than show a broken-image icon above the deal.
  if (deal.image) {
    img.addEventListener("error", () => img.remove());
    img.src = deal.image;
    img.alt = deal.title || "";
  } else {
    img.remove();
  }

  node.querySelector(".deal-title").textContent = deal.title || "Untitled product";

  const whyLabel = node.querySelector(".deal-why-label");
  const blurbEl = node.querySelector(".deal-blurb");
  if (deal.blurb) {
    whyLabel.hidden = false;
    blurbEl.textContent = deal.blurb;
  } else {
    whyLabel.remove();
    blurbEl.remove();
  }

  node.querySelector(".deal-price").textContent = formatPrice(deal.price);

  const discountEl = node.querySelector(".deal-discount");
  const offer = verifiedOffer(deal);
  if (offer) {
    discountEl.textContent = `${offer.discountPct}% off (was ${formatPrice(offer.listPrice)})`;
  } else if (deal.priceClaim) {
    discountEl.textContent = `🔥 ${deal.priceClaim}`;
  } else if (deal.trending) {
    discountEl.textContent = `📈 Trending`;
  } else {
    discountEl.remove();
  }

  const trustEl = node.querySelector(".deal-trust");
  if (showPriceHistory(deal)) {
    trustEl.hidden = false;
    trustEl.textContent = "Checked against price history";
  } else {
    trustEl.remove();
  }

  const codeBadgeEl = node.querySelector(".deal-code-badge");
  if (deal.requiresCode) {
    codeBadgeEl.textContent = "Code required at checkout";
  } else {
    codeBadgeEl.remove();
  }

  const buyLink = node.querySelector(".deal-buy");
  buyLink.href = deal.url;

  // Copies the same affiliate-tagged link Buy Now uses. Clipboard rather
  // than navigator.share: the OS share sheet takes focus, which closes the
  // popup out from under it.
  const shareBtn = node.querySelector(".deal-share");
  const label = shareBtn.textContent;
  shareBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(deal.url);
      shareBtn.textContent = "Link copied ✓";
    } catch (err) {
      console.error("[dealbots] couldn't copy share link", err);
      shareBtn.textContent = "Couldn't copy link";
    }
    setTimeout(() => {
      shareBtn.textContent = label;
    }, 2000);
  });

  return node;
}

async function fetchFeed(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Feed request failed (${url}): ${res.status}`);
  }
  return res.json();
}

document.getElementById("telegram-link").href = TELEGRAM_URL;
document.getElementById("mastodon-link").href = MASTODON_URL;

async function loadDeals() {
  try {
    let feed;
    try {
      feed = await fetchFeed(REMOTE_FEED_URL);
    } catch (remoteErr) {
      console.warn("[dealbots] remote feed unreachable, falling back to bundled deals.json", remoteErr);
      feed = await fetchFeed(LOCAL_FEED_URL);
    }

    if (feedHasNoPick(feed)) {
      statusEl.textContent = "No pick today, check back tomorrow.";
      return;
    }

    const deal = feed.deals[0];
    const stale = isFeedStale(feed.generatedAt);

    statusEl.remove();
    contentEl.appendChild(renderDeal(deal));

    if (stale) {
      document.body.classList.add("is-stale");
      headingEl.textContent = "Latest pick";
      const updated = formatUtcDate(feed.generatedAt);
      staleEl.hidden = false;
      staleEl.textContent = updated ? `Last updated ${updated}` : "Last updated";
      sourceNoteEl.textContent = "This pick is from an older feed.";
    } else {
      const pickDate = formatUtcDate(deal.pickedOn || feed.generatedAt);
      if (pickDate) dateEl.textContent = pickDate;
      sourceNoteEl.textContent = "Picked by AI from trending, genuinely-discounted products.";
    }

    if (feed.deals.length > 1) {
      const moreLink = document.getElementById("more-deals-link");
      moreLink.href = MORE_DEALS_URL;
    } else {
      document.getElementById("more-deals-link").remove();
    }
  } catch (err) {
    statusEl.textContent = "Couldn't load today's deal. Try again later.";
    console.error("[dealbots] failed to load feed", err);
  }
}

loadDeals();
