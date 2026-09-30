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

  const buyLink = node.querySelector(".deal-buy");
  buyLink.href = deal.url;

  return node;
}

async function loadDeals() {
  try {
    const res = await fetch(FEED_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Feed request failed: ${res.status}`);
    }
    const feed = await res.json();

    if (!feed.deals || feed.deals.length === 0) {
      statusEl.textContent = "No deal found for today. Check back tomorrow.";
      return;
    }

    statusEl.remove();
    for (const deal of feed.deals) {
      contentEl.appendChild(renderDeal(deal));
    }

    if (feed.generatedAt) {
      const generated = new Date(feed.generatedAt);
      dateEl.textContent = generated.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    }
    sourceNoteEl.textContent = "Picked by AI from trending, genuinely-discounted products.";
  } catch (err) {
    statusEl.textContent = "Couldn't load today's deal. Try again later.";
    console.error("[dealbots] failed to load feed", err);
  }
}

loadDeals();
