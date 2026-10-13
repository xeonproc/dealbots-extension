import test from "node:test";
import assert from "node:assert/strict";
import { dealNumberError, discountPctFromPrices, publishableDeals } from "../src/validateDeal.js";

test("discount percent is rounded from cent prices", () => {
  assert.equal(discountPctFromPrices(5.99, 9.99), 40);
  assert.equal(discountPctFromPrices(45.99, 80), 43);
  assert.equal(discountPctFromPrices(19.99, 39.99), 50);
});

test("no discount when the price is not below the list price", () => {
  assert.equal(discountPctFromPrices(10, 10), null);
  assert.equal(discountPctFromPrices(12, 10), null);
  assert.equal(discountPctFromPrices(10.0, 10.004), null);
});

test("a plain price with no discount claim is publishable", () => {
  assert.equal(dealNumberError({ price: 7.99, listPrice: null, discountPct: null }), null);
});

test("drops a discount that does not match price and list price", () => {
  const deal = { asin: "B0BAD", price: 5.99, listPrice: 9.99, discountPct: 50 };
  assert.match(dealNumberError(deal), /does not match/);
  const kept = publishableDeals([deal, { price: 5.99, listPrice: 9.99, discountPct: 40 }]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].discountPct, 40);
});

test("drops a deal whose price is not below the list price", () => {
  assert.match(dealNumberError({ price: 10, listPrice: 10, discountPct: 0 }), /not below/);
  assert.match(dealNumberError({ price: 12, listPrice: 10, discountPct: 10 }), /not below/);
});

test("drops a discount percent with no list price", () => {
  assert.match(dealNumberError({ price: 8, listPrice: null, discountPct: 20 }), /without a list price/);
});

test("drops a price-history verdict that is not backed by a real discount", () => {
  assert.match(
    dealNumberError({ price: 8, listPrice: null, discountPct: null, priceHistoryChecked: true }),
    /price-history/
  );
  assert.equal(
    dealNumberError({ price: 5.99, listPrice: 9.99, discountPct: 40, priceHistoryChecked: true }),
    null
  );
});

test("drops a deal with no price", () => {
  assert.match(dealNumberError({ price: null, listPrice: 10, discountPct: 50 }), /invalid price/);
});
