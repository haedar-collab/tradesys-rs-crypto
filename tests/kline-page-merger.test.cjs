"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeKlinePages, nextOlderEndTime, ERROR_CODES } = require("../lib/kline-page-merger.cjs");

const NOW = 100_000_000;
const HOUR = 60 * 60 * 1000;
const candle = (openTime) => [
  openTime, "10", "12", "9", "11", "100",
  openTime + HOUR - 1, "1100"
];
const page = (start, count) => Array.from({ length: count }, (_, i) => candle(start + i * HOUR));

test("merges older and newer pages in chronological order", () => {
  const older = page(NOW - 5 * HOUR, 2);
  const newer = page(NOW - 3 * HOUR, 3);
  const result = mergeKlinePages([older, newer], {
    now: NOW, intervalMs: HOUR, targetCandles: 5, minCandles: 5
  });
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.valid, true);
  assert.equal(result.rows.length, 5);
  assert.equal(result.stats.oldestOpenTime, NOW - 5 * HOUR);
  assert.equal(result.stats.newestOpenTime, NOW - HOUR);
});

test("supports exact target count reached across pages", () => {
  const result = mergeKlinePages([page(NOW - 3 * HOUR, 2), page(NOW - HOUR, 1)], {
    now: NOW, intervalMs: HOUR, targetCandles: 3
  });
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.stats.targetReached, true);
});

test("returns HISTORY_EXHAUSTED when provider history ends before target", () => {
  const result = mergeKlinePages([page(NOW - 2 * HOUR, 2)], {
    now: NOW, intervalMs: HOUR, targetCandles: 100, minCandles: 2,
    historyExhausted: true
  });
  assert.equal(result.status, "HISTORY_EXHAUSTED");
  assert.equal(result.valid, true);
  assert.equal(result.stats.targetReached, false);
});

test("a short oldest page is not treated as exhaustion unless explicitly confirmed", () => {
  const result = mergeKlinePages([page(NOW - 2 * HOUR, 2)], {
    now: NOW, intervalMs: HOUR, targetCandles: 100
  });
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.valid, false);
});

test("accepts an empty terminal older page only when history exhaustion is explicit", () => {
  const result = mergeKlinePages([page(NOW - 2 * HOUR, 2), []], {
    now: NOW, intervalMs: HOUR, targetCandles: 100,
    historyExhausted: true
  });
  assert.equal(result.status, "HISTORY_EXHAUSTED");
  assert.equal(result.rows.length, 2);
});

test("an empty terminal page without explicit exhaustion remains incomplete", () => {
  const result = mergeKlinePages([page(NOW - 2 * HOUR, 2), []], {
    now: NOW, intervalMs: HOUR, targetCandles: 100
  });
  assert.equal(result.status, "INCOMPLETE");
  assert.ok(result.warnings.some(item => item.code === ERROR_CODES.EMPTY_PAGE_UNCONFIRMED));
});

test("rejects an empty page in the middle of pagination", () => {
  const result = mergeKlinePages([page(NOW - 4 * HOUR, 2), [], page(NOW - 2 * HOUR, 2)], {
    now: NOW, intervalMs: HOUR, targetCandles: 4
  });
  assert.equal(result.status, "INVALID");
  assert.ok(result.errors.some(item => item.code === ERROR_CODES.EMPTY_PAGE_NOT_TERMINAL));
});

test("rejects overlapping pages and duplicate timestamps", () => {
  const result = mergeKlinePages([
    page(NOW - 3 * HOUR, 2),
    page(NOW - 2 * HOUR, 2)
  ], { now: NOW, intervalMs: HOUR, targetCandles: 4 });
  assert.equal(result.status, "INVALID");
  assert.ok(result.errors.some(item => item.code === ERROR_CODES.MERGED_SEQUENCE_INVALID));
});

test("rejects pages supplied in newest-to-oldest order", () => {
  const result = mergeKlinePages([
    page(NOW - 2 * HOUR, 2),
    page(NOW - 4 * HOUR, 2)
  ], { now: NOW, intervalMs: HOUR, targetCandles: 4 });
  assert.equal(result.status, "INVALID");
});

test("rejects missing intervals between pages", () => {
  const result = mergeKlinePages([
    page(NOW - 5 * HOUR, 2),
    page(NOW - 2 * HOUR, 2)
  ], { now: NOW, intervalMs: HOUR, targetCandles: 4 });
  assert.equal(result.status, "INVALID");
});

test("a fetch failure after valid pages is INCOMPLETE, never COMPLETE", () => {
  const result = mergeKlinePages([page(NOW - 3 * HOUR, 2)], {
    now: NOW, intervalMs: HOUR, targetCandles: 4,
    fetchError: "older page request failed"
  });
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.valid, false);
  assert.equal(result.stats.fetchFailed, true);
});

test("target count reached does not mask a recorded fetch failure", () => {
  const result = mergeKlinePages([page(NOW - 2 * HOUR, 2)], {
    now: NOW, intervalMs: HOUR, targetCandles: 2,
    fetchError: "request failed after retry"
  });
  assert.equal(result.status, "INCOMPLETE");
});

test("reports insufficient history distinctly from malformed data", () => {
  const result = mergeKlinePages([page(NOW - HOUR, 1)], {
    now: NOW, intervalMs: HOUR, targetCandles: 10, minCandles: 3,
    historyExhausted: true
  });
  assert.equal(result.status, "HISTORY_EXHAUSTED");
  assert.equal(result.valid, false);
  assert.equal(result.stats.enoughCandles, false);
});

test("rejects malformed candle rows", () => {
  const bad = page(NOW - 2 * HOUR, 2);
  bad[1][2] = "8";
  const result = mergeKlinePages([bad], {
    now: NOW, intervalMs: HOUR, targetCandles: 2
  });
  assert.equal(result.status, "INVALID");
  assert.ok(result.errors.some(item => item.code === ERROR_CODES.PAGE_INVALID));
});

test("rejects a candle that is not closed", () => {
  const rows = [candle(NOW - HOUR)];
  rows[0][6] = NOW;
  const result = mergeKlinePages([rows], {
    now: NOW, intervalMs: HOUR, targetCandles: 1
  });
  assert.equal(result.status, "INVALID");
});

test("rejects non-array page input", () => {
  const result = mergeKlinePages([null], { now: NOW });
  assert.equal(result.status, "INVALID");
  assert.ok(result.errors.some(item => item.code === ERROR_CODES.PAGE_NOT_ARRAY));
});

test("rejects invalid top-level input", () => {
  assert.equal(mergeKlinePages(null).status, "INVALID");
  assert.equal(mergeKlinePages([]).status, "INCOMPLETE");
});

test("does not mutate source pages", () => {
  const pages = [page(NOW - 3 * HOUR, 2), page(NOW - HOUR, 1)];
  const before = JSON.stringify(pages);
  mergeKlinePages(pages, { now: NOW, intervalMs: HOUR, targetCandles: 3 });
  assert.equal(JSON.stringify(pages), before);
});

test("calculates the previous-page cursor as oldestOpenTime minus one", () => {
  assert.equal(nextOlderEndTime(1_000), 999);
  assert.equal(nextOlderEndTime(0), null);
});

test("rejects unsafe cursor timestamps", () => {
  assert.throws(() => nextOlderEndTime(-1), TypeError);
  assert.throws(() => nextOlderEndTime(Number.MAX_SAFE_INTEGER + 1), TypeError);
});
