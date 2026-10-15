import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankSlickdealsDeterministic } from "../src/rankSlickdeals.js";
import { addBlurbs, buildBlurbPrompt, cleanWhy, titleForPrompt } from "../src/rankWithClaude.js";
import { buildFeed } from "../src/buildFeed.js";
import { findCandidates, findManualCandidates } from "../src/analyze.js";
import { dealNumberError } from "../src/validateDeal.js";
import { config } from "../src/config.js";

const trending = JSON.parse(readFileSync(new URL("../fixtures/trending.json", import.meta.url), "utf8"));
const priceHistory = JSON.parse(readFileSync(new URL("../fixtures/priceHistory.json", import.meta.url), "utf8"));

test("slickdeals ranking uses parsed prices and never asks the model for them", () => {
  const source = readFileSync(new URL("../src/rankSlickdeals.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /callClaudeJSON/);
  assert.doesNotMatch(source, /"currentPrice"/);

  const ranked = rankSlickdealsDeterministic([
    {
      asin: "B0PLAIN",
      title: "Plain Mug $9.00",
      rawText: "Just a mug.",
      image: "https://example.com/mug.jpg",
      voteVelocity: 50,
    },
    {
      asin: "B0DEAL",
      title: "Soft Throw Blanket $20.00",
      rawText: "was $50.00",
      image: "",
      voteVelocity: 1,
      currentPrice: 1,
      discountPct: 99,
      priceHistoryChecked: true,
    },
    {
      asin: "B0LOCKED",
      title: "Secret $4.00",
      rawText: "Prime members only",
      image: "https://example.com/x.jpg",
      voteVelocity: 100,
    },
    {
      asin: "B0CODE",
      title: "Paper $6.00",
      rawText: "was $10 with code PAPER",
      image: "https://example.com/paper.jpg",
      voteVelocity: 2,
    },
  ]);

  assert.deepEqual(
    ranked.map((d) => d.asin),
    ["B0CODE", "B0DEAL", "B0PLAIN"]
  );
  assert.equal(ranked[0].discountPct, 40);
  assert.equal(ranked[0].priceHistoryChecked, false);
  assert.equal(ranked[1].currentPrice, 20);
  assert.equal(ranked[1].discountPct, 60);
  assert.equal(ranked[1].priceHistoryChecked, false);
  assert.ok(ranked.every((d) => dealNumberError({ ...d, price: d.currentPrice }) == null));
});

test("featured slot prefers an imaged discount over an imageless one", () => {
  const ranked = rankSlickdealsDeterministic(
    [
      {
        asin: "B0NOIMG",
        title: "No Photo $10",
        rawText: "was $40",
        image: "",
        voteVelocity: 9,
      },
      {
        asin: "B0IMG",
        title: "With Photo $10",
        rawText: "was $40",
        image: "https://example.com/p.jpg",
        voteVelocity: 1,
      },
    ],
    2
  );
  assert.equal(ranked[0].asin, "B0IMG");
});

test("blurbs do not change prices, and price figures are stripped from the why", () => {
  assert.equal(
    cleanWhy("Cute paper with 40% off at $5.99 today.", "fallback"),
    "Cute paper with at today."
  );
  assert.equal(cleanWhy("100% cotton 5-pack", "fallback"), "100% cotton 5-pack");
  assert.equal(cleanWhy(40, "fallback"), "fallback");
  assert.equal(cleanWhy("$5", "fallback"), "fallback");
});

test("an exact parsed price may stay in the blurb; a rounded or invented one does not", () => {
  const wiha = { currentPrice: 15.08, listPrice: null, discountPct: null };
  assert.equal(
    cleanWhy(
      "Six inches of Wiha adjustable wrench for the junk drawer. $15.08, and the post marks it as a coupon deal.",
      "fallback",
      wiha
    ),
    "Six inches of Wiha adjustable wrench for the junk drawer. $15.08, and the post marks it as a coupon deal."
  );
  assert.equal(
    cleanWhy("Six inches of wrench. $15 for the junk drawer today.", "fallback", wiha),
    "fallback"
  );
  assert.equal(
    cleanWhy("Soft throw at $20, was $50, 60% off today.", "fallback", {
      currentPrice: 20,
      listPrice: 50,
      discountPct: 60,
    }),
    "Soft throw at $20, was $50, 60% off today."
  );
  assert.equal(
    cleanWhy("Soft throw at $20, 90% off today.", "fallback", {
      currentPrice: 20,
      listPrice: 50,
      discountPct: 60,
    }),
    "fallback"
  );
  assert.equal(cleanWhy("100% cotton 5-pack for the drawer.", "fallback", wiha), "100% cotton 5-pack for the drawer.");
});

test("a blurb that names Amazon or repeats the popup label falls back or drops the label", () => {
  const wiha = { currentPrice: 15.08 };
  assert.equal(
    cleanWhy("Six inches of wrench, and Amazon has it in stock today.", "fallback", wiha),
    "fallback"
  );
  assert.equal(
    cleanWhy("Why it made the cut: six inches of wrench for the junk drawer.", "fallback", wiha),
    "six inches of wrench for the junk drawer."
  );
  assert.equal(
    cleanWhy("Six inches of wrench for the junk drawer. It is $15.08 with a checkout code.", "fallback", {
      currentPrice: 15.08,
      requiresCode: false,
    }),
    "fallback"
  );
  assert.equal(
    cleanWhy("A flameless lighter for the candles. A code is required at checkout.", "fallback", {
      currentPrice: 3.95,
      requiresCode: true,
    }),
    "A flameless lighter for the candles. A code is required at checkout."
  );
});

test("prompt titles drop the store name and the price, and the blurb prompt stays inside the facts", () => {
  assert.equal(
    titleForPrompt("[AC] $15.08* | 6″ Wiha Adjustable Wrench at Amazon"),
    "6″ Wiha Adjustable Wrench"
  );
  assert.equal(titleForPrompt("Grinch Polly Pocket $9.99 in Stock at Amazon"), "Grinch Polly Pocket in Stock");

  const prompt = buildBlurbPrompt([
    {
      title: "[AC] $15.08* | 6″ Wiha Adjustable Wrench at Amazon",
      currentPrice: 15.08,
      listPrice: null,
      discountPct: null,
      priceClaim: "Coupon deal",
      requiresCode: false,
      priceHistoryChecked: false,
    },
  ]);
  const products = prompt.slice(prompt.lastIndexOf("Products:"));
  assert.doesNotMatch(products, /amazon/i);
  assert.match(products, /"currentPrice": 15\.08/);
  assert.match(products, /"priceClaim": "Coupon deal"/);
  assert.doesNotMatch(products, /\$15\.08/);

  assert.match(prompt, /witty friend/i);
  assert.match(prompt, /under 45 words/i);
  assert.match(prompt, /Never invent a price/);
  assert.match(prompt, /No offensive or mean humor/);
  assert.match(prompt, /If you are unsure/);
  assert.match(prompt, /Never write the word Amazon/);
  assert.match(prompt, /Writing \$15 for a currentPrice of 15\.08 invents a price/);
  const exampleBlurb = prompt.slice(prompt.indexOf('"Six inches'), prompt.indexOf("Example 2"));
  assert.match(exampleBlurb, /\$15\.08 for the replacement/);
  assert.doesNotMatch(exampleBlurb, /\$15 for/);
  assert.doesNotMatch(exampleBlurb, /was-price|steel|quality|outlast/i);
});

test("without an API key the why is a sentence and the numbers stay put", async () => {
  assert.equal(config.anthropicApiKey, "");
  const [deal] = await addBlurbs([
    {
      title: "Anker 737 Power Bank $45.99",
      category: "Electronics > Portable Power",
      currentPrice: 45.99,
      listPrice: 78.85,
      discountPct: 42,
      priceHistoryChecked: true,
    },
  ]);
  assert.equal(deal.currentPrice, 45.99);
  assert.equal(deal.listPrice, 78.85);
  assert.equal(deal.discountPct, 42);
  assert.equal(deal.priceHistoryChecked, true);
  assert.match(deal.blurb, /community-picked deal/i);
  assert.doesNotMatch(deal.blurb, /\$|\d+\s*%/);
});

test("price history path sets the verdict only from the 90-day baseline", () => {
  const found = findCandidates({ trending, priceHistory, config });
  assert.equal(found.length, 1);
  assert.equal(found[0].asin, "B0H8GKFBCW");
  assert.equal(found[0].priceHistoryChecked, true);
  assert.equal(found[0].currentPrice, 45.99);
  assert.equal(dealNumberError(found[0]), null);

  const manual = findManualCandidates({
    candidates: [{ asin: "B0HAND", title: "Hand pick", currentPrice: 45.99, listPrice: 79.99, priceHistoryChecked: true }],
    config,
  });
  assert.equal(manual.length, 1);
  assert.equal(manual[0].priceHistoryChecked, false);
  assert.equal(dealNumberError(manual[0]), null);
});

test("feed adds generatedAt, paused, and a per-pick date without dropping old fields", () => {
  const now = new Date("2026-10-13T15:04:00.000Z");
  const feed = buildFeed(
    [
      {
        asin: "B0TEST0001",
        title: "Wireless Earbuds",
        image: "",
        currentPrice: 24.99,
        listPrice: 49.99,
        discountPct: 50,
        priceClaim: null,
        priceHistoryChecked: true,
        requiresCode: false,
        blurb: "Compact wireless earbuds with a charging case.",
        voteVelocity: 0,
      },
    ],
    { now }
  );

  assert.equal(feed.generatedAt, "2026-10-13T15:04:00.000Z");
  assert.equal(feed.paused, false);
  assert.equal(feed.deals[0].pickedOn, "2026-10-13");
  assert.equal(feed.deals[0].price, 24.99);
  assert.equal(feed.deals[0].listPrice, 49.99);
  assert.equal(feed.deals[0].discountPct, 50);
  assert.equal(feed.deals[0].priceHistoryChecked, true);
  assert.equal(feed.deals[0].blurb, "Compact wireless earbuds with a charging case.");
  assert.equal(feed.deals[0].url, "https://www.amazon.com/dp/B0TEST0001?tag=dealbots00-20");

  // Fields the store build (popup 1.0.11) already reads.
  const deal = feed.deals[0];
  assert.equal(typeof deal.title, "string");
  assert.equal(typeof deal.price, "number");
  assert.equal(typeof deal.blurb, "string");
  assert.equal(typeof deal.url, "string");
  assert.ok(feed.generatedAt);
});

test("kill switch writes an empty paused feed even if deals were passed in", () => {
  const feed = buildFeed(
    [{ asin: "B0TEST0001", title: "Should not publish", currentPrice: 5, blurb: "nope" }],
    { paused: true, now: new Date("2026-10-13T15:04:00.000Z") }
  );
  assert.equal(feed.paused, true);
  assert.deepEqual(feed.deals, []);
  assert.equal(feed.generatedAt, "2026-10-13T15:04:00.000Z");
});
