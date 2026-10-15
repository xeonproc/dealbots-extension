import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CACHE_KEY,
  COPY,
  cachePayload,
  decidePopupState,
  earlierLabel,
  loadFeedSources,
  parseCachedPick,
  readCachedPick,
  writeCachedPick,
} from "./popup-state.js";

const NOW = Date.parse("2026-10-15T12:00:00.000Z");
const FRESH_AT = "2026-10-15T11:00:00.000Z";
const STALE_AT = "2026-10-13T23:00:00.000Z";

function freshFeed(overrides = {}) {
  return {
    generatedAt: FRESH_AT,
    paused: false,
    deals: [
      {
        title: "Adjustable wrench",
        url: "https://example.com/dp/wrench",
        price: 15.08,
        blurb: "Six inches of wrench.",
        pickedOn: "2026-10-15",
      },
      { title: "Second pick", url: "https://example.com/dp/other" },
    ],
    ...overrides,
  };
}

function memoryStorage(initial) {
  const map = new Map(initial);
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

test("loading is a skeleton before the deal arrives", () => {
  const view = decidePopupState({ phase: "loading" });
  assert.equal(view.kind, "loading");
  assert.equal(view.skeleton, true);
  assert.equal(view.showRetry, false);
  assert.equal(view.deal, undefined);
  assert.equal(view.message, "Loading today's deal...");
  assert.equal(/amazon/i.test(view.message), false);
});

test("empty feed when there is no current pick", () => {
  const feeds = [
    null,
    { paused: true, generatedAt: FRESH_AT, deals: [{ title: "Hidden", url: "https://example.com/x" }] },
    { paused: false, generatedAt: FRESH_AT, deals: [] },
    { generatedAt: FRESH_AT },
  ];
  for (const feed of feeds) {
    const view = decidePopupState({ phase: "ready", feed, now: NOW });
    assert.equal(view.kind, "empty", JSON.stringify(feed));
    assert.equal(view.showRetry, false);
    assert.equal(view.deal, undefined);
    assert.match(view.message, /Today's pick is on its way/);
    assert.match(view.message, /Check back soon/);
    assert.equal(/amazon/i.test(view.message), false);
  }
});

test("a stale feed is not a current pick", () => {
  const exactly = new Date(NOW - 36 * 60 * 60 * 1000).toISOString();
  const stillCurrent = decidePopupState({
    phase: "ready",
    feed: freshFeed({ generatedAt: exactly }),
    now: NOW,
  });
  assert.equal(stillCurrent.kind, "deal");

  const stale = decidePopupState({
    phase: "ready",
    feed: freshFeed({ generatedAt: STALE_AT }),
    now: NOW,
  });
  assert.equal(stale.kind, "empty");
  assert.match(stale.message, /on its way/i);
  assert.match(stale.message, /check back soon/i);
  assert.equal(stale.deal, undefined);
});

test("a fresh pick is ready to show", () => {
  const view = decidePopupState({ phase: "ready", feed: freshFeed(), now: NOW });
  assert.equal(view.kind, "deal");
  assert.equal(view.deal.title, "Adjustable wrench");
  assert.equal(view.showMore, true);
  assert.equal(view.showRetry, false);
  assert.equal(view.note, COPY.freshNote);
});

test("failed fetch without a cache asks for a retry", () => {
  const view = decidePopupState({ phase: "error", cached: null });
  assert.equal(view.kind, "error");
  assert.equal(view.showRetry, true);
  assert.equal(view.deal, undefined);
  assert.match(view.message, /Couldn't load today's deal/);
  assert.match(view.message, /another try/);
  assert.equal(/amazon/i.test(view.message), false);
});

test("failed fetch falls back to the last cached pick, labeled from earlier", () => {
  const cached = cachePayload(freshFeed(), NOW);
  const view = decidePopupState({ phase: "error", cached });
  assert.equal(view.kind, "cached");
  assert.equal(view.showRetry, true);
  assert.equal(view.deal.title, "Adjustable wrench");
  assert.equal(view.label, "From earlier · Oct 15");
  assert.match(view.message, /Couldn't load today's deal/);
  assert.match(view.message, /from earlier/i);
  assert.equal(view.note, "This pick is from earlier.");
  assert.equal(/amazon/i.test(`${view.message} ${view.label} ${view.note}`), false);
});

test("bad cache JSON and a pick with no link are ignored", () => {
  assert.equal(parseCachedPick("not json"), null);
  assert.equal(parseCachedPick(""), null);
  assert.equal(parseCachedPick("{}"), null);
  assert.equal(parseCachedPick(JSON.stringify({ deal: { title: "No link" } })), null);
  assert.equal(parseCachedPick(JSON.stringify({ deal: { title: "Bad", url: "javascript:alert(1)" } })), null);
  assert.equal(earlierLabel({ deal: { url: "https://example.com/p" } }), "From earlier");
});

test("only a fresh pick is stored, and an empty or stale feed does not erase it", () => {
  const storage = memoryStorage();
  assert.equal(writeCachedPick(storage, freshFeed(), NOW), true);
  const saved = storage.getItem(CACHE_KEY);
  assert.equal(readCachedPick(storage).deal.title, "Adjustable wrench");

  assert.equal(cachePayload(freshFeed({ deals: [] }), NOW), null);
  assert.equal(cachePayload(freshFeed({ generatedAt: STALE_AT }), NOW), null);
  assert.equal(cachePayload(freshFeed({ paused: true }), NOW), null);
  assert.equal(writeCachedPick(storage, { deals: [], generatedAt: FRESH_AT }, NOW), false);
  assert.equal(writeCachedPick(storage, freshFeed({ generatedAt: STALE_AT }), NOW), false);
  assert.equal(storage.getItem(CACHE_KEY), saved);
});

test("bad JSON and network errors are a failed fetch; empty remote feed stays empty", async () => {
  const badJson = async () => {
    throw new SyntaxError("Unexpected token < in JSON");
  };
  const broken = await loadFeedSources(badJson, {
    remoteUrl: "https://example.test/deals.json",
    localUrl: "deals.json",
  });
  assert.equal(broken.ok, false);
  assert.equal(decidePopupState({ phase: "error", cached: null }).kind, "error");

  let calls = 0;
  const offlineThenLocal = async (url) => {
    calls += 1;
    if (String(url).startsWith("https://")) throw new TypeError("Failed to fetch");
    return freshFeed({ generatedAt: STALE_AT });
  };
  const fallback = await loadFeedSources(offlineThenLocal, {
    remoteUrl: "https://example.test/deals.json",
    localUrl: "deals.json",
  });
  assert.equal(calls, 2);
  assert.equal(fallback.ok, true);
  assert.equal(fallback.source, "local");
  assert.equal(decidePopupState({ phase: "ready", feed: fallback.feed, now: NOW }).kind, "empty");

  const emptyRemote = await loadFeedSources(
    async (url) => {
      if (String(url).startsWith("https://")) return { generatedAt: FRESH_AT, paused: false, deals: [] };
      return freshFeed();
    },
    { remoteUrl: "https://example.test/deals.json", localUrl: "deals.json" }
  );
  assert.equal(emptyRemote.source, "remote");
  assert.equal(decidePopupState({ phase: "ready", feed: emptyRemote.feed, now: NOW }).kind, "empty");
});

test("popup markup reserves a skeleton and a retry button", () => {
  const html = readFileSync(new URL("./popup.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("./popup.css", import.meta.url), "utf8");

  assert.ok(html.includes(`>${COPY.loading}<`) || html.includes(`>${COPY.loading}</p>`));
  assert.match(html, /class="spinner"/);
  assert.match(html, /class="skeleton"/);
  assert.match(html, /id="retry"/);
  assert.match(html, />Retry</);
  assert.equal(/amazon/i.test(html), false);

  const block = (selector) => {
    const match = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css);
    return match ? match[1] : "";
  };
  const height = (body) => /height:\s*([^;]+)/.exec(body)?.[1].trim();
  assert.equal(height(block("\\.deal-image")), "160px");
  assert.equal(height(block("\\.skeleton-image")), height(block("\\.deal-image")));
});
