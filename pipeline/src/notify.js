import { config } from "./config.js";

function formatMessage(feed) {
  const top = feed.deals[0];
  if (!top) return null;

  const price = typeof top.price === "number" ? `$${top.price.toFixed(2)}` : top.price;
  const discount = top.discountPct
    ? ` (${top.discountPct}% off)`
    : top.priceClaim
    ? ` (${top.priceClaim})`
    : top.trending
    ? ` (trending)`
    : "";

  return (
    `🔥 Today's deal: ${top.title}\n` +
    `${price}${discount}\n\n` +
    `${top.blurb}\n\n` +
    `${top.url}\n\n` +
    `More deals: ${config.moreDealsUrl}\n\n` +
    `#AmazonDeals #Deals #DealOfTheDay`
  );
}

async function postToTelegram(text) {
  if (!config.telegramBotToken || !config.telegramChatId) {
    console.log("[notify] Telegram not configured (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID unset) — skipping.");
    return;
  }

  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram post failed: ${res.status} ${body}`);
  }
  console.log("[notify] Posted to Telegram.");
}

async function postToMastodon(text) {
  if (!config.mastodonInstanceUrl || !config.mastodonAccessToken) {
    console.log("[notify] Mastodon not configured (MASTODON_INSTANCE_URL/MASTODON_ACCESS_TOKEN unset) — skipping.");
    return;
  }

  const url = `${config.mastodonInstanceUrl.replace(/\/$/, "")}/api/v1/statuses`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.mastodonAccessToken}`,
    },
    body: JSON.stringify({ status: text, visibility: "public" }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mastodon post failed: ${res.status} ${body}`);
  }
  console.log("[notify] Posted to Mastodon.");
}

// Best-effort: a failed post to one channel shouldn't take down the whole
// pipeline run (the feed/page/archive already succeeded by the time this
// runs) or block the other channel from still getting posted to.
export async function postToChannels(feed) {
  const text = formatMessage(feed);
  if (!text) {
    console.log("[notify] Empty feed, nothing to post.");
    return;
  }

  const results = await Promise.allSettled([postToTelegram(text), postToMastodon(text)]);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[notify]", r.reason?.message || r.reason);
    }
  }
}
