import { formatUtcDate, showPriceHistory, verifiedOffer } from "./feed-status.js";
import {
  COPY,
  decidePopupState,
  loadFeedSources,
  readCachedPick,
  writeCachedPick,
} from "./popup-state.js";
import {
  REMOTE_FEED_URL,
  LOCAL_FEED_URL,
  MORE_DEALS_URL,
  TELEGRAM_URL,
  MASTODON_URL,
} from "./config.js";

const loadingEl = document.getElementById("loading");
const statusEl = document.getElementById("status");
const messagePanel = document.getElementById("message-panel");
const messageTitleEl = document.getElementById("message-title");
const messageDetailEl = document.getElementById("message-detail");
const retryBtn = document.getElementById("retry");
const dealSlot = document.getElementById("deal-slot");
const contentEl = document.getElementById("content");
const dateEl = document.getElementById("date");
const staleEl = document.getElementById("stale-notice");
const sourceNoteEl = document.getElementById("source-note");
const moreLink = document.getElementById("more-deals-link");
const footerBones = document.getElementById("footer-bones");
const template = document.getElementById("deal-template");

statusEl.textContent = COPY.loading;
retryBtn.textContent = COPY.retry;

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

function parkFooter(parked) {
  sourceNoteEl.style.visibility = "";
  sourceNoteEl.removeAttribute("aria-hidden");
  moreLink.style.visibility = "";
  moreLink.style.pointerEvents = "";
  moreLink.removeAttribute("aria-hidden");
  if (moreLink.tabIndex === -1) moreLink.tabIndex = 0;
  footerBones.hidden = true;
  if (!parked) return;

  // Hold the loaded footer's height while the skeleton is up, so the
  // popup does not grow when the source line and "see other deals" appear.
  sourceNoteEl.textContent = COPY.freshNote;
  sourceNoteEl.style.visibility = "hidden";
  sourceNoteEl.setAttribute("aria-hidden", "true");
  moreLink.hidden = false;
  moreLink.removeAttribute("href");
  moreLink.style.visibility = "hidden";
  moreLink.style.pointerEvents = "none";
  moreLink.setAttribute("aria-hidden", "true");
  moreLink.tabIndex = -1;
  footerBones.hidden = false;
}

function resetChrome() {
  document.body.classList.remove("is-stale");
  dateEl.textContent = "";
  staleEl.hidden = true;
  staleEl.textContent = "";
  parkFooter(false);
  sourceNoteEl.textContent = "";
  moreLink.hidden = true;
  dealSlot.replaceChildren();
}

function applyView(view) {
  resetChrome();
  document.body.dataset.view = view.kind;
  contentEl.dataset.view = view.kind;

  const loading = view.kind === "loading";
  loadingEl.hidden = !loading;
  loadingEl.setAttribute("aria-busy", loading ? "true" : "false");
  if (loading) parkFooter(true);

  const showMessage = view.kind === "empty" || view.kind === "error" || view.kind === "cached";
  messagePanel.hidden = !showMessage;
  if (showMessage) {
    messageTitleEl.textContent = view.title;
    messageDetailEl.textContent = view.detail;
  }

  retryBtn.hidden = !view.showRetry;

  if (view.kind === "deal") {
    dealSlot.appendChild(renderDeal(view.deal));
    const pickDate = formatUtcDate(view.deal.pickedOn || view.generatedAt);
    if (pickDate) dateEl.textContent = pickDate;
    sourceNoteEl.textContent = view.note;
    if (view.showMore) {
      moreLink.hidden = false;
      moreLink.href = MORE_DEALS_URL;
    }
    return;
  }

  if (view.kind === "cached" && view.deal) {
    document.body.classList.add("is-stale");
    staleEl.hidden = false;
    staleEl.textContent = view.label;
    sourceNoteEl.textContent = view.note;
    dealSlot.appendChild(renderDeal(view.deal));
  }
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

let loadToken = 0;

async function loadDeals() {
  const token = ++loadToken;
  applyView(decidePopupState({ phase: "loading" }));

  const result = await loadFeedSources(fetchFeed, {
    remoteUrl: REMOTE_FEED_URL,
    localUrl: LOCAL_FEED_URL,
  });
  if (token !== loadToken) return;

  if (!result.ok) {
    console.error("[dealbots] failed to load feed", result.localErr || result.remoteErr);
    applyView(decidePopupState({ phase: "error", cached: readCachedPick(localStorage) }));
    return;
  }

  if (result.source === "local") {
    console.warn("[dealbots] remote feed unreachable, falling back to bundled deals.json", result.remoteErr);
  }

  const view = decidePopupState({ phase: "ready", feed: result.feed });
  if (view.kind === "deal") writeCachedPick(localStorage, result.feed);
  applyView(view);
}

retryBtn.addEventListener("click", () => {
  loadDeals();
});

loadDeals();
