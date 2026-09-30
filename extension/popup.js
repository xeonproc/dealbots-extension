const statusEl = document.getElementById("status");
const contentEl = document.getElementById("content");
const dateEl = document.getElementById("date");
const sourceNoteEl = document.getElementById("source-note");
const template = document.getElementById("deal-template");

function formatPrice(value) {
  return typeof value === "number" ? `$${value.toFixed(2)}` : value;
}

function renderDeal(deal) {
  const node = template.content.cloneNode(true);

  const img = node.querySelector(".deal-image");
  img.src = deal.image || "";
  img.alt = deal.title || "";

  node.querySelector(".deal-title").textContent = deal.title || "Untitled product";
  node.querySelector(".deal-blurb").textContent = deal.blurb || "";
  node.querySelector(".deal-price").textContent = formatPrice(deal.price);

  const discountEl = node.querySelector(".deal-discount");
  if (deal.discountPct) {
    discountEl.textContent = `${deal.discountPct}% off (was ${formatPrice(deal.listPrice)})`;
  } else {
    discountEl.remove();
  }

  const codeBadgeEl = node.querySelector(".deal-code-badge");
  if (deal.requiresCode) {
    codeBadgeEl.textContent = "Code required at checkout";
  } else {
    codeBadgeEl.remove();
  }

  const buyLink = node.querySelector(".deal-buy");
  buyLink.href = deal.url;

  return node;
}

async function fetchFeed(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Feed request failed (${url}): ${res.status}`);
  }
  return res.json();
}

async function loadDeals() {
  try {
    let feed;
    try {
      feed = await fetchFeed(REMOTE_FEED_URL);
    } catch (remoteErr) {
      console.warn("[dealbots] remote feed unreachable, falling back to bundled deals.json", remoteErr);
      feed = await fetchFeed(LOCAL_FEED_URL);
    }

    if (!feed.deals || feed.deals.length === 0) {
      statusEl.textContent = "No deal found for today. Check back tomorrow.";
      return;
    }

    statusEl.remove();
    contentEl.appendChild(renderDeal(feed.deals[0]));

    if (feed.generatedAt) {
      const generated = new Date(feed.generatedAt);
      dateEl.textContent = generated.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    }
    sourceNoteEl.textContent = "Picked by AI from trending, genuinely-discounted products.";

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
