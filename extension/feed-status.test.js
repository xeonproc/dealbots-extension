import test from "node:test";
import assert from "node:assert/strict";
import {
  STALE_AFTER_MS,
  isFeedStale,
  formatUtcDate,
  feedHasNoPick,
  verifiedOffer,
  showPriceHistory,
} from "./feed-status.js";

const NOW = Date.parse("2026-10-13T12:00:00.000Z");

test("stale means older than 36 hours", () => {
  assert.equal(STALE_AFTER_MS, 36 * 60 * 60 * 1000);
  const exactly = new Date(NOW - STALE_AFTER_MS).toISOString();
  const older = new Date(NOW - STALE_AFTER_MS - 1).toISOString();
  assert.equal(isFeedStale(exactly, NOW), false);
  assert.equal(isFeedStale(older, NOW), true);
  assert.equal(isFeedStale("2026-10-13T10:00:00.000Z", NOW), false);
  assert.equal(isFeedStale(undefined, NOW), false);
  assert.equal(isFeedStale("not-a-date", NOW), false);
});

test("dates render from the UTC calendar day", () => {
  assert.equal(formatUtcDate("2026-10-13T02:30:00.000Z"), "Oct 13");
  assert.equal(formatUtcDate("2026-10-11"), "Oct 11");
  assert.equal(formatUtcDate(""), "");
});

test("paused or an empty list is no pick; a filled feed is not", () => {
  assert.equal(feedHasNoPick({ paused: true, deals: [{ title: "Still here" }] }), true);
  assert.equal(feedHasNoPick({ paused: false, deals: [] }), true);
  assert.equal(feedHasNoPick({ deals: [{ title: "Pick" }] }), false);
  assert.equal(feedHasNoPick(null), true);
  assert.equal(feedHasNoPick({ paused: "true", deals: [{ title: "Pick" }] }), false);
});

test("was/now shows only when the numbers agree", () => {
  const match = verifiedOffer({ price: 5.99, listPrice: 9.99, discountPct: 40 });
  assert.equal(match.discountPct, 40);

  assert.equal(verifiedOffer({ price: 5.99, listPrice: 9.99, discountPct: 55 }), null);
  assert.equal(verifiedOffer({ price: 10, listPrice: 10, discountPct: 0 }), null);
  assert.equal(verifiedOffer({ price: 24.99, listPrice: 49.99 }).discountPct, 50);
});

test("price-history line needs the flag and a verified discount", () => {
  const backed = { price: 24.99, listPrice: 49.99, discountPct: 50, priceHistoryChecked: true };
  assert.equal(showPriceHistory(backed), true);
  assert.equal(showPriceHistory({ ...backed, priceHistoryChecked: false }), false);
  assert.equal(showPriceHistory({ ...backed, priceHistoryChecked: undefined }), false);
  assert.equal(showPriceHistory({ ...backed, discountPct: 10 }), false);

  // Current published feed shape: numbers, no history flag.
  const published = { price: 5.99, listPrice: 9.99, discountPct: 40, blurb: "Cute paper." };
  assert.equal(showPriceHistory(published), false);
  assert.equal(verifiedOffer(published).discountPct, 40);
});
