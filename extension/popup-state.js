// Popup view decisions shared with node:test. No DOM, no network.
import { feedHasNoPick, formatUtcDate, isFeedStale } from "./feed-status.js";

export const CACHE_KEY = "dealbots.lastPick";

export const COPY = {
  loading: "Loading today's deal...",
  emptyTitle: "Today's pick is on its way.",
  emptyDetail: "Check back soon.",
  errorTitle: "Couldn't load today's deal.",
  errorDetail: "Give it another try.",
  errorCachedDetail: "Here's a pick from earlier.",
  retry: "Retry",
  fromEarlier: "From earlier",
  fromEarlierNote: "This pick is from earlier.",
  freshNote: "Picked by AI from trending, genuinely-discounted products.",
};

function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

export function earlierLabel(cached) {
  const date = formatUtcDate(cached?.deal?.pickedOn || cached?.generatedAt);
  return date ? `${COPY.fromEarlier} · ${date}` : COPY.fromEarlier;
}

export function parseCachedPick(raw) {
  if (raw == null || raw === "") return null;
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (!parsed.deal || typeof parsed.deal !== "object" || Array.isArray(parsed.deal)) return null;
  if (!isHttpUrl(parsed.deal.url)) return null;
  return parsed;
}

// Only a current pick is worth keeping. An empty or stale feed must not
// wipe the last good one — that copy is the offline fallback.
export function cachePayload(feed, now = Date.now()) {
  if (!feed || feedHasNoPick(feed) || isFeedStale(feed.generatedAt, now)) return null;
  const deal = feed.deals[0];
  if (!deal || typeof deal !== "object" || !isHttpUrl(deal.url)) return null;
  return {
    v: 1,
    deal,
    generatedAt: feed.generatedAt || null,
  };
}

export function readCachedPick(storage) {
  if (!storage) return null;
  try {
    return parseCachedPick(storage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

export function writeCachedPick(storage, feed, now = Date.now()) {
  const payload = cachePayload(feed, now);
  if (!payload || !storage) return false;
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function decidePopupState({ phase, feed, cached, now = Date.now() } = {}) {
  if (phase === "loading") {
    return {
      kind: "loading",
      message: COPY.loading,
      skeleton: true,
      showRetry: false,
    };
  }

  if (phase === "error") {
    const saved = parseCachedPick(cached);
    if (saved) {
      return {
        kind: "cached",
        title: COPY.errorTitle,
        detail: COPY.errorCachedDetail,
        message: `${COPY.errorTitle} ${COPY.errorCachedDetail}`,
        showRetry: true,
        deal: saved.deal,
        label: earlierLabel(saved),
        note: COPY.fromEarlierNote,
      };
    }
    return {
      kind: "error",
      title: COPY.errorTitle,
      detail: COPY.errorDetail,
      message: `${COPY.errorTitle} ${COPY.errorDetail}`,
      showRetry: true,
    };
  }

  // A paused feed, an empty list, or a feed older than the stale window
  // is not a current pick. Say so instead of rendering yesterday's card.
  if (feedHasNoPick(feed) || isFeedStale(feed?.generatedAt, now) || !feed?.deals?.[0]) {
    return {
      kind: "empty",
      title: COPY.emptyTitle,
      detail: COPY.emptyDetail,
      message: `${COPY.emptyTitle} ${COPY.emptyDetail}`,
      showRetry: false,
    };
  }

  return {
    kind: "deal",
    deal: feed.deals[0],
    generatedAt: feed.generatedAt || null,
    showMore: feed.deals.length > 1,
    note: COPY.freshNote,
    showRetry: false,
  };
}

// Remote feed first. Bundled deals.json only when that request fails
// (network, HTTP error, or JSON that does not parse). A successful empty
// or stale remote feed is authoritative and does not fall through.
export async function loadFeedSources(fetchFeed, { remoteUrl, localUrl }) {
  try {
    const feed = await fetchFeed(remoteUrl);
    return { ok: true, feed, source: "remote" };
  } catch (remoteErr) {
    try {
      const feed = await fetchFeed(localUrl);
      return { ok: true, feed, source: "local", remoteErr };
    } catch (localErr) {
      return { ok: false, remoteErr, localErr };
    }
  }
}
