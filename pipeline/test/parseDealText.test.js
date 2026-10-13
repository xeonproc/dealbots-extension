import test from "node:test";
import assert from "node:assert/strict";
import { extractDealNumbers, isUnusablePost } from "../src/parseDealText.js";
import { dealNumberError } from "../src/validateDeal.js";

test("reads a trailing title price and ignores a shipping threshold", () => {
  const numbers = extractDealNumbers({
    title: '12-Piece Picture Frame Set $14.99 & More + Free Shipping on $35+',
    rawText: "Twelve black frames.",
  });
  assert.equal(numbers.currentPrice, 14.99);
  assert.equal(numbers.listPrice, null);
  assert.equal(numbers.discountPct, null);
  assert.equal(numbers.priceHistoryChecked, false);
});

test("computes discount from was/now text and ignores bogus model numbers", () => {
  const numbers = extractDealNumbers({
    title: "Soft Throw Blanket $20.00",
    rawText: "was $50.00",
    currentPrice: 1,
    listPrice: 2,
    discountPct: 99,
    priceHistoryChecked: true,
  });
  assert.equal(numbers.currentPrice, 20);
  assert.equal(numbers.listPrice, 50);
  assert.equal(numbers.discountPct, 60);
  assert.equal(numbers.priceClaim, null);
  assert.equal(numbers.priceHistoryChecked, false);
  assert.equal(dealNumberError({ ...numbers, price: numbers.currentPrice }), null);
});

test("parses now/reg phrasing and comma prices", () => {
  const now = extractDealNumbers({ title: "Lamp", rawText: "now $19.99, reg. $39.99" });
  assert.equal(now.currentPrice, 19.99);
  assert.equal(now.listPrice, 39.99);
  assert.equal(now.discountPct, 50);

  const big = extractDealNumbers({ title: "Sofa", rawText: "now $1,299.00, was $1,599.00" });
  assert.equal(big.currentPrice, 1299);
  assert.equal(big.listPrice, 1599);
  assert.equal(dealNumberError({ ...big, price: big.currentPrice }), null);
});

test("does not publish a list price when the current price is not lower", () => {
  const numbers = extractDealNumbers({ title: "Widget $50", rawText: "was $40" });
  assert.equal(numbers.currentPrice, 50);
  assert.equal(numbers.listPrice, null);
  assert.equal(numbers.discountPct, null);
});

test("code and sale labels come from the text, not a free-form claim", () => {
  const code = extractDealNumbers({
    title: "Wrapping Paper $5.99",
    rawText: "using code NE5B1NTJ at checkout",
  });
  assert.equal(code.requiresCode, true);
  assert.equal(code.priceClaim, "Coupon deal");

  const low = extractDealNumbers({ title: "Mug $12.00", rawText: "Lowest price ever" });
  assert.equal(low.priceClaim, "Lowest price");
  assert.equal(low.requiresCode, false);

  const sale = extractDealNumbers({ title: "Socks", rawText: "on sale for $8.00" });
  assert.equal(sale.currentPrice, 8);
  assert.equal(sale.priceClaim, "On sale");
});

test("a real percent discount suppresses the text claim", () => {
  const numbers = extractDealNumbers({
    title: "Blanket $20",
    rawText: "was $50 with code SAVE20",
  });
  assert.equal(numbers.discountPct, 60);
  assert.equal(numbers.priceClaim, null);
  assert.equal(numbers.requiresCode, true);
});

test("membership-locked posts are unusable", () => {
  assert.equal(isUnusablePost("Prime members only $5"), true);
  assert.equal(isUnusablePost("was $40 now $20"), false);
});
