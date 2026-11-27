"use strict";

const { fetchHistoricalKlines } = require("./kline-history-fetcher.cjs");
const { createBinanceKlinePageFetcher } = require("./binance-kline-page-adapter.cjs");

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const DEFAULT_TARGET_CANDLES = 4500;

/**
 * Strict history boundary for the per-coin 4H backtest.
 * Only a fully reached target is accepted; exhausted/partial history is
 * reported but never passed downstream as a usable backtest dataset.
 */
async function loadPerCoinBacktestHistory(options = {}) {
  const {
    callTool,
    server,
    tool,
    symbol,
    now = Date.now(),
    targetCandles = DEFAULT_TARGET_CANDLES,
    pageLimit = 1000,
    maxPages = 5,
    maxRetries = 1
  } = options;

  const fetchPage = createBinanceKlinePageFetcher({ callTool, server, tool });
  const history = await fetchHistoricalKlines({
    fetchPage,
    symbol,
    interval: "4h",
    pageLimit,
    targetCandles,
    minCandles: targetCandles,
    maxPages,
    maxRetries,
    now,
    // Binance endTime is inclusive; cap the first page at the last fully closed 4H candle.
    initialEndTime: Math.max(0, Math.floor(now / FOUR_HOURS_MS) * FOUR_HOURS_MS - 1),
    intervalMs: FOUR_HOURS_MS,
    // Binance returns fewer than limit when no more historical rows exist
    // before the requested endTime. This is a terminal-history signal, not
    // permission to accept a shorter backtest sample.
    isHistoryExhausted: ({ page }) => Array.isArray(page) && page.length < pageLimit
  });

  const accepted = history.status === "COMPLETE" &&
    history.valid === true &&
    history.rows.length >= targetCandles;

  return {
    accepted,
    status: history.status,
    rows: accepted ? history.rows.slice(-targetCandles) : [],
    history,
    reason: accepted ? null : buildBlockReason(history, targetCandles)
  };
}

function buildBlockReason(history, targetCandles) {
  const received = history && history.rows ? history.rows.length : 0;
  const status = history && history.status ? history.status : "UNKNOWN";
  return `Backtest blocked: historical 4H data status ${status}; required ${targetCandles} closed candles, received ${received}.`;
}

module.exports = {
  loadPerCoinBacktestHistory,
  FOUR_HOURS_MS,
  DEFAULT_TARGET_CANDLES
};
