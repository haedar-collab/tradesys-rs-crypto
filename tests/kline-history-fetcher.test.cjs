"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchHistoricalKlines } = require("../lib/kline-history-fetcher.cjs");

const NOW = 100_000_000;
const HOUR = 60 * 60 * 1000;
const candle = openTime => [
  openTime, "10", "12", "9", "11", "100",
  openTime + HOUR - 1, "1100"
];
const page = (start, count) => Array.from({ length: count }, (_, i) => candle(start + i * HOUR));
const base = {
  symbol: "BTCUSDT",
  interval: "1h",
  pageLimit: 2,
  targetCandles: 3,
  minCandles: 2,
  maxPages: 4,
  maxRetries: 1,
  now: NOW,
  intervalMs: HOUR
};

test("fetches latest then older pages using endTime=oldestOpenTime-1", async () => {
  const calls = [];
  const latest = page(NOW - 3 * HOUR, 2);
  const older = page(NOW - 5 * HOUR, 2);
  const result = await fetchHistoricalKlines({
    ...base,
    fetchPage: async params => {
      calls.push(params);
      return calls.length === 1 ? latest : older;
    }
  });
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.rows.length, 4);
  assert.equal(result.stats.oldestOpenTime, NOW - 5 * HOUR);
  assert.equal(result.stats.newestOpenTime, NOW - 2 * HOUR);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].endTime, undefined);
  assert.equal(calls[1].endTime, NOW - 3 * HOUR - 1);
  assert.deepEqual(result.pagination.cursorHistory, [NOW - 3 * HOUR - 1]);
});

test("stops immediately when target count is reached", async () => {
  let calls = 0;
  const result = await fetchHistoricalKlines({
    ...base,
    targetCandles: 2,
    fetchPage: async () => { calls += 1; return page(NOW - 3 * HOUR, 2); }
  });
  assert.equal(result.status, "COMPLETE");
  assert.equal(calls, 1);
  assert.equal(result.pagination.stopReason, "TARGET_REACHED");
});

test("short page without explicit history confirmation remains incomplete", async () => {
  const result = await fetchHistoricalKlines({
    ...base,
    fetchPage: async () => page(NOW - 2 * HOUR, 1)
  });
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.valid, false);
  assert.equal(result.pagination.stopReason, "SHORT_PAGE_UNCONFIRMED");
});

test("short page can be HISTORY_EXHAUSTED only through explicit provider confirmation", async () => {
  const result = await fetchHistoricalKlines({
    ...base,
    fetchPage: async () => page(NOW - 2 * HOUR, 1),
    isHistoryExhausted: async context => context.page.length < context.pageLimit
  });
  assert.equal(result.status, "HISTORY_EXHAUSTED");
  assert.equal(result.valid, false);
  assert.equal(result.pagination.historyExhausted, true);
});

test("empty page without confirmation is incomplete", async () => {
  let calls = 0;
  const result = await fetchHistoricalKlines({
    ...base,
    fetchPage: async () => { calls += 1; return calls === 1 ? page(NOW - 3 * HOUR, 2) : []; }
  });
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.pagination.stopReason, "EMPTY_PAGE_UNCONFIRMED");
});

test("empty page with explicit confirmation records history exhaustion", async () => {
  let calls = 0;
  const result = await fetchHistoricalKlines({
    ...base,
    fetchPage: async () => { calls += 1; return calls === 1 ? page(NOW - 3 * HOUR, 2) : []; },
    isHistoryExhausted: async ({ page: rows }) => rows.length === 0
  });
  assert.equal(result.status, "HISTORY_EXHAUSTED");
  assert.equal(result.pagination.historyExhausted, true);
});

test("retries a transient fetch failure and records retry count", async () => {
  let calls = 0;
  const result = await fetchHistoricalKlines({
    ...base,
    targetCandles: 2,
    fetchPage: async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary network failure");
      return page(NOW - 3 * HOUR, 2);
    }
  });
  assert.equal(result.status, "COMPLETE");
  assert.equal(calls, 2);
  assert.equal(result.pagination.retryCount, 1);
});

test("fetch failure after a successful page is never treated as complete", async () => {
  let calls = 0;
  const result = await fetchHistoricalKlines({
    ...base,
    fetchPage: async () => {
      calls += 1;
      if (calls === 1) return page(NOW - 3 * HOUR, 2);
      throw new Error("older page unavailable");
    }
  });
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.valid, false);
  assert.equal(result.pagination.fetchFailed, true);
  assert.equal(result.pagination.fetchError, "older page unavailable");
});

test("first-page fetch failure remains explicitly incomplete", async () => {
  const result = await fetchHistoricalKlines({
    ...base,
    fetchPage: async () => { throw new Error("Binance unavailable"); }
  });
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.stats.fetchFailed, true);
  assert.equal(result.pagination.stopReason, "FETCH_FAILED");
});

test("rejects malformed page data", async () => {
  const bad = page(NOW - 3 * HOUR, 2);
  bad[1][2] = "8";
  const result = await fetchHistoricalKlines({
    ...base,
    fetchPage: async () => bad
  });
  assert.equal(result.status, "INVALID");
  assert.equal(result.pagination.stopReason, "INVALID_PAGE_DATA");
});

test("rejects pages whose candles are not closed", async () => {
  const rows = [candle(NOW - HOUR)];
  rows[0][6] = NOW;
  const result = await fetchHistoricalKlines({
    ...base,
    targetCandles: 1,
    fetchPage: async () => rows
  });
  assert.equal(result.status, "INVALID");
});

test("does not exceed the configured page request limit", async () => {
  let calls = 0;
  const result = await fetchHistoricalKlines({
    ...base,
    maxPages: 1,
    fetchPage: async () => { calls += 1; return page(NOW - 3 * HOUR, 2); }
  });
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(calls, 1);
  assert.equal(result.pagination.stopReason, "MAX_PAGES");
});

test("rejects invalid options without making a request", async () => {
  let calls = 0;
  const result = await fetchHistoricalKlines({
    ...base,
    pageLimit: 0,
    fetchPage: async () => { calls += 1; return []; }
  });
  assert.equal(result.status, "INVALID");
  assert.equal(calls, 0);
});

test("preserves source page arrays without mutation", async () => {
  const latest = page(NOW - 3 * HOUR, 2);
  const older = page(NOW - 5 * HOUR, 2);
  const before = JSON.stringify([latest, older]);
  await fetchHistoricalKlines({
    ...base,
    fetchPage: async params => params.endTime == null ? latest : older
  });
  assert.equal(JSON.stringify([latest, older]), before);
});

test("rejects a provider page larger than the requested limit", async () => {
  const result = await fetchHistoricalKlines({
    ...base,
    fetchPage: async () => page(NOW - 4 * HOUR, 3)
  });
  assert.equal(result.status, "INVALID");
  assert.equal(result.pagination.stopReason, "PAGE_EXCEEDS_LIMIT");
  assert.ok(result.errors.some(item => item.code === "PAGINATION_INVARIANT_FAILED"));
});

test("rejects a page response that does not move the backward cursor", async () => {
  let calls = 0;
  const latest = page(NOW - 3 * HOUR, 2);
  const result = await fetchHistoricalKlines({
    ...base,
    targetCandles: 5,
    fetchPage: async () => { calls += 1; return latest; }
  });
  assert.equal(result.status, "INVALID");
  assert.equal(result.pagination.stopReason, "CURSOR_NOT_PROGRESSING");
  assert.equal(calls, 2);
});

test("explicitly exhausted empty history is not mislabeled as a fetch failure", async () => {
  const result = await fetchHistoricalKlines({
    ...base,
    fetchPage: async () => [],
    isHistoryExhausted: async () => true
  });
  assert.equal(result.status, "HISTORY_EXHAUSTED");
  assert.equal(result.valid, false);
  assert.equal(result.stats.historyExhausted, true);
  assert.equal(result.stats.fetchFailed, false);
});
