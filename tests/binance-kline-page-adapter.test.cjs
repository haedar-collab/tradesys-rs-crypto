"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBinanceKlinePageFetcher } = require("../lib/binance-kline-page-adapter.cjs");

const row = [1000, "1", "2", "0.5", "1.5", "10", 9999, "15", 3, "4", "6", "0"];

test("adapter forwards the initial-page request without adding an endTime", async () => {
  let received;
  const fetchPage = createBinanceKlinePageFetcher({
    server: "Binance",
    tool: "spot.klines",
    callTool: async (...args) => {
      received = args;
      return { payload: [row] };
    }
  });

  const result = await fetchPage({ symbol: "BTCUSDT", interval: "4h", limit: 1000 });

  assert.deepEqual(result, [row]);
  assert.deepEqual(received, ["Binance", "spot.klines", {
    symbol: "BTCUSDT", interval: "4h", limit: 1000
  }]);
});

test("adapter forwards endTime unchanged for older-page requests", async () => {
  let received;
  const fetchPage = createBinanceKlinePageFetcher({
    server: "Binance",
    tool: "spot.klines",
    callTool: async (...args) => {
      received = args;
      return { payload: [row] };
    }
  });

  await fetchPage({
    symbol: "ETHUSDT", interval: "4h", limit: 1000, endTime: 123456789
  });

  assert.deepEqual(received[2], {
    symbol: "ETHUSDT", interval: "4h", limit: 1000, endTime: 123456789
  });
  assert.equal(received.length, 3, "no cache options are injected by default");
});

test("adapter unwraps JSON-string payloads", async () => {
  const fetchPage = createBinanceKlinePageFetcher({
    server: "Binance",
    tool: "spot.klines",
    callTool: async () => ({ payload: JSON.stringify([row]) })
  });

  assert.deepEqual(await fetchPage({
    symbol: "BTCUSDT", interval: "1d", limit: 500
  }), [row]);
});

test("adapter rejects non-array payloads", async () => {
  const fetchPage = createBinanceKlinePageFetcher({
    server: "Binance",
    tool: "spot.klines",
    callTool: async () => ({ payload: { code: -1, msg: "bad request" } })
  });

  await assert.rejects(
    fetchPage({ symbol: "BTCUSDT", interval: "4h", limit: 1000 }),
    /payload must be an array/
  );
});

test("adapter rejects malformed JSON strings", async () => {
  const fetchPage = createBinanceKlinePageFetcher({
    server: "Binance",
    tool: "spot.klines",
    callTool: async () => ({ payload: "not-json" })
  });

  await assert.rejects(
    fetchPage({ symbol: "BTCUSDT", interval: "4h", limit: 1000 }),
    /non-JSON string/
  );
});

test("adapter validates request parameters before calling the connector", async () => {
  let calls = 0;
  const fetchPage = createBinanceKlinePageFetcher({
    server: "Binance",
    tool: "spot.klines",
    callTool: async () => { calls++; return { payload: [] }; }
  });

  await assert.rejects(fetchPage({ symbol: "BTCUSDT", interval: "4h", limit: 1001 }), /limit/);
  await assert.rejects(fetchPage({ symbol: "BTCUSDT", interval: "4h", limit: 100, endTime: -1 }), /endTime/);
  assert.equal(calls, 0);
});

test("adapter propagates connector errors without converting them to empty history", async () => {
  const failure = new Error("Binance unavailable");
  const fetchPage = createBinanceKlinePageFetcher({
    server: "Binance",
    tool: "spot.klines",
    callTool: async () => { throw failure; }
  });

  await assert.rejects(
    fetchPage({ symbol: "BTCUSDT", interval: "4h", limit: 1000 }),
    error => error === failure
  );
});

test("adapter passes explicitly configured call options unchanged", async () => {
  const callOptions = { cache: { staleTime: 0 } };
  let received;
  const fetchPage = createBinanceKlinePageFetcher({
    server: "Binance",
    tool: "spot.klines",
    callOptions,
    callTool: async (...args) => { received = args; return { payload: [] }; }
  });

  await fetchPage({ symbol: "BTCUSDT", interval: "4h", limit: 1000 });
  assert.equal(received[3], callOptions);
});
