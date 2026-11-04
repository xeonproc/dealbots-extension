import test from "node:test";
import assert from "node:assert/strict";
import { rankSlickdealsCandidates } from "../src/rankSlickdeals.js";
import { dealNumberError } from "../src/validateDeal.js";
import {
  FRESH_POST_MS,
  isFreshPost,
  judgeLivePrice,
  judgeThread,
  livePriceTooHigh,
  parseProductPage,
  priceAfterPercentOff,
  productUrl,
  threadUrl,
  verifyDeals,
} from "../src/verifyDeal.js";

function htmlResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    },
  };
}

function activeThread(title = "Mug $9.00") {
  const payload = JSON.stringify([
    { isExpired: 1, mainDesktopBlock: 2 },
    false,
    { dealTitle: 3 },
    title,
  ]);
  return `<html><head><title>${title}</title></head>
    <script>var dataLayer = {"isExpiredDeal":"No"};</script>
    <script id="__NUXT_DATA__" type="application/json">${payload}</script>
    <body><p>Please report the deal if expired</p></body></html>`;
}

function expiredThread() {
  const payload = JSON.stringify([
    { isExpired: 1, mainDesktopBlock: 2 },
    true,
    {},
  ]);
  return `<html><head><title>Mug $9.00</title></head>
    <script>var dataLayer = {"isExpiredDeal":"Yes"};</script>
    <script id="__NUXT_DATA__" type="application/json">${payload}</script></html>`;
}

function pricePage({ price, coupon = "", extra = "" }) {
  const [whole, fraction] = price.split(".");
  return `<html><head><title>Product</title></head><body>
    <span id="apex-pricetopay-accessibility-label" class="aok-offscreen"> $${price} </span>
    <span class="a-price priceToPay"><span class="a-price-whole">${whole}</span><span class="a-price-fraction">${fraction}</span></span>
    ${coupon}
    <span class="a-offscreen">$13.29</span>
    ${extra}
    </body></html>`;
}

test("a post is fresh through the 24 hour mark and not after it", () => {
  const now = Date.parse("2026-11-04T18:00:00.000Z");
  assert.equal(isFreshPost("2026-11-04T12:00:00.000Z", now), true);
  assert.equal(isFreshPost(new Date(now - FRESH_POST_MS).toISOString(), now), true);
  assert.equal(isFreshPost(new Date(now - FRESH_POST_MS - 1000).toISOString(), now), false);
  assert.equal(isFreshPost("not a date", now), false);
});

test("thread and product urls stay on the pages the pipeline already trusts", () => {
  assert.equal(
    threadUrl("https://slickdeals.net/f/20254365-knife?utm_source=rss&amp;utm_medium=RSS2"),
    "https://slickdeals.net/f/20254365-knife"
  );
  assert.equal(threadUrl("https://example.com/f/123"), "");
  assert.equal(productUrl("B0FP28Y6W5"), "https://www.amazon.com/dp/B0FP28Y6W5");
  assert.equal(productUrl("nope"), "");
});

test("50% off $97.99 is $48.99, and 10% above the feed price is the keep line", () => {
  assert.equal(priceAfterPercentOff(97.99, 50), 48.99);
  assert.equal(livePriceTooHigh(10, 11), false);
  assert.equal(livePriceTooHigh(10, 11.01), true);
  assert.equal(livePriceTooHigh(14.69, 16.16), false);
  assert.equal(livePriceTooHigh(14.69, 16.17), true);
});

test("the source thread drops an expired or sold-out post and keeps the report-if-expired footer", () => {
  assert.equal(judgeThread(activeThread()).action, "keep");
  assert.equal(judgeThread(expiredThread()).action, "drop");
  assert.match(judgeThread(expiredThread()).reason, /expired/);
  assert.equal(judgeThread(activeThread("Knife set - Sold Out")).action, "drop");
  assert.match(judgeThread(activeThread("Knife set - Sold Out")).reason, /sold out/);
  assert.equal(judgeThread("<html><title>Just a moment...</title><body>captcha</body></html>").action, "keep");
  assert.equal(judgeThread("", 404).action, "keep");
});

test("the product page reads the buy-box price and a coupon only when the page shows one", () => {
  const knife = parseProductPage(
    pricePage({
      price: "97.99",
      coupon: `<span class="aok-hidden">50% off coupon applied</span>
        <span class="a-color-success couponLabelText"> Apply 50% coupon <span>Shop items</span></span>
        <p>Coupon price $48.99 Terms</p>`,
      extra: "<span>Typical price: $129.99</span>",
    })
  );
  assert.equal(knife.status, "ok");
  assert.equal(knife.price, 97.99);
  assert.equal(knife.effectivePrice, 48.99);

  const full = parseProductPage(pricePage({ price: "29.99", extra: "<span>Typical price: $33.79</span>" }));
  assert.equal(full.status, "ok");
  assert.equal(full.effectivePrice, 29.99);
  assert.equal(full.coupon, null);

  const dollars = parseProductPage(
    pricePage({ price: "30.00", coupon: '<span class="couponLabelText">Clip $5.00 coupon</span>' })
  );
  assert.equal(dollars.effectivePrice, 25);

  const mystery = parseProductPage(
    pricePage({ price: "97.99", coupon: '<span class="couponLabelText">Apply special coupon</span>' })
  );
  assert.equal(mystery.status, "ambiguous");

  const clash = parseProductPage(
    pricePage({
      price: "97.99",
      coupon: '<span class="couponLabelText">Apply 50% coupon</span><span class="couponLabelText">Apply $5.00 coupon</span>',
    })
  );
  assert.equal(clash.status, "ambiguous");

  const blocked = parseProductPage('<html><title>Robot Check</title><form action="/errors/validateCaptcha"></form></html>');
  assert.equal(blocked.status, "blocked");
});

test("the 2026-11-04 knife price is dropped, including after the detected coupon", () => {
  const page = parseProductPage(
    pricePage({
      price: "97.99",
      coupon: '<span class="couponLabelText">Apply 50% coupon</span>',
    })
  );
  const judged = judgeLivePrice(14.69, page);
  assert.equal(judged.action, "drop");
  assert.match(judged.reason, /48\.99/);
  assert.match(judged.reason, /14\.69/);

  const noCoupon = judgeLivePrice(14.69, parseProductPage(pricePage({ price: "97.99" })));
  assert.equal(noCoupon.action, "drop");
  assert.match(noCoupon.reason, /97\.99/);

  // A checkout code that is not on the page does not lower the live price.
  const codeOnly = judgeLivePrice(22.49, parseProductPage(pricePage({ price: "29.99" })));
  assert.equal(codeOnly.action, "drop");

  const believable = judgeLivePrice(48.99, page);
  assert.equal(believable.action, "keep");
  assert.equal(believable.priceVerified, true);
});

test("blocked and ambiguous pages stay in the feed unverified", () => {
  assert.equal(judgeLivePrice(14.69, { status: "blocked" }).priceVerified, false);
  assert.equal(judgeLivePrice(14.69, { status: "blocked" }).action, "keep");
  assert.equal(judgeLivePrice(14.69, { status: "ambiguous" }).priceVerified, false);
});

test("verifyDeals drops a dead thread and a contradicted price, and stamps the rest", async () => {
  const now = new Date("2026-11-04T18:00:00.000Z");
  const kept = await verifyDeals(
    [
      {
        asin: "B0EXPIRED1",
        currentPrice: 9,
        sourceLink: "https://slickdeals.net/f/1-expired",
      },
      {
        asin: "B0FP28Y6W5",
        currentPrice: 14.69,
        sourceLink: "https://slickdeals.net/f/20254365-knife?utm_source=rss&amp;utm_medium=RSS2",
      },
      {
        asin: "B0GOODDEAL",
        currentPrice: 9,
        sourceLink: "https://slickdeals.net/f/2-mug",
      },
      {
        asin: "B0BLOCKED1",
        currentPrice: 8,
        sourceLink: "https://slickdeals.net/f/3-blocked",
      },
    ],
    {
      now,
      fetchImpl: async (url) => {
        const target = String(url);
        if (target.includes("/f/1-expired")) return htmlResponse(expiredThread());
        if (target.includes("slickdeals.net")) return htmlResponse(activeThread());
        if (target.endsWith("/dp/B0FP28Y6W5")) {
          return htmlResponse(pricePage({ price: "97.99", coupon: '<span class="couponLabelText">Apply 50% coupon</span>' }));
        }
        if (target.endsWith("/dp/B0GOODDEAL")) return htmlResponse(pricePage({ price: "9.00" }));
        if (target.endsWith("/dp/B0BLOCKED1")) {
          return htmlResponse('<html><title>Robot Check</title><form action="/errors/validateCaptcha"></form></html>');
        }
        throw new Error(target);
      },
    }
  );

  assert.deepEqual(
    kept.map((deal) => deal.asin),
    ["B0GOODDEAL", "B0BLOCKED1"]
  );
  assert.equal(kept[0].priceVerified, true);
  assert.equal(kept[0].verifiedAt, "2026-11-04T18:00:00.000Z");
  assert.equal(kept[1].priceVerified, false);
  assert.equal(kept[1].verifiedAt, null);
  assert.equal(dealNumberError({ ...kept[0], price: kept[0].currentPrice }), null);
  assert.equal(dealNumberError({ ...kept[1], price: kept[1].currentPrice }), null);
});

test("the knife pick is not published, and an unverified pick is not first", async () => {
  const now = new Date("2026-11-04T18:00:00.000Z");
  const seen = [];
  const ranked = await rankSlickdealsCandidates(
    [
      {
        asin: "B0FP28Y6W5",
        title: "15-Piece High Carbon Stainless Steel Kitchen Knife Set w/ Honing Rod $14.69",
        rawText: "on sale",
        sourceLink: "https://slickdeals.net/f/20254365-knife",
        image: "https://example.com/knife.jpg",
        voteVelocity: 80,
        pubDate: "2026-11-04T12:00:00.000Z",
      },
      {
        asin: "B0BLOCKED1",
        title: "Blocked Lantern $8.00",
        rawText: "on sale",
        sourceLink: "https://slickdeals.net/f/3-blocked",
        image: "https://example.com/lantern.jpg",
        voteVelocity: 40,
        pubDate: "2026-11-04T12:00:00.000Z",
      },
      {
        asin: "B0GOODDEAL",
        title: "Plain Mug $9.00",
        rawText: "on sale",
        sourceLink: "https://slickdeals.net/f/2-mug",
        image: "https://example.com/mug.jpg",
        voteVelocity: 1,
        pubDate: "2026-11-04T12:00:00.000Z",
      },
    ],
    8,
    {
      now,
      fetchImpl: async (url) => {
        const target = String(url);
        seen.push(target);
        if (target.includes("slickdeals.net")) return htmlResponse(activeThread());
        if (target.endsWith("/dp/B0FP28Y6W5")) {
          return htmlResponse(
            pricePage({ price: "97.99", coupon: '<span class="couponLabelText">Apply 50% coupon</span>' })
          );
        }
        if (target.endsWith("/dp/B0GOODDEAL")) return htmlResponse(pricePage({ price: "9.00" }));
        if (target.endsWith("/dp/B0BLOCKED1")) {
          return htmlResponse('<html><title>Robot Check</title><form action="/errors/validateCaptcha"></form></html>');
        }
        throw new Error(target);
      },
    }
  );

  assert.deepEqual(
    ranked.map((deal) => deal.asin),
    ["B0GOODDEAL", "B0BLOCKED1"]
  );
  assert.equal(ranked[0].priceVerified, true);
  assert.equal(ranked[0].currentPrice, 9);
  assert.equal(ranked[1].priceVerified, false);
  assert.ok(ranked.every((deal) => dealNumberError({ ...deal, price: deal.currentPrice }) == null));
  assert.ok(seen.some((url) => url === "https://www.amazon.com/dp/B0FP28Y6W5"));
  assert.ok(seen.some((url) => url === "https://slickdeals.net/f/20254365-knife"));
});
