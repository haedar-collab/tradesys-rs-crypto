"use strict";

const { fetchHistoricalKlines } = require("./kline-history-fetcher.cjs");
const { createBinanceKlinePageFetcher } = require("./binance-kline-page-adapter.cjs");

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TARGET_CANDLES = 4500;
const INTERVALS = Object.freeze({ "4h": FOUR_HOURS_MS, "1d": ONE_DAY_MS });

/**
 * Strict history boundary for backtest datasets.
 * Only complete, contiguous, closed target-sized samples are accepted.
 */
async function loadStrictBacktestHistory(options = {}) {
  const {
    callTool, server, tool, symbol, now = Date.now(),
    interval = "4h", targetCandles = DEFAULT_TARGET_CANDLES,
    pageLimit = 1000, maxRetries = 1
  } = options;
  const intervalMs = INTERVALS[interval];
  if (!intervalMs) {
    return {
      accepted: false, status: "INVALID", rows: [],
      history: null, reason: `Backtest blocked: unsupported interval ${String(interval)}.`
    };
  }
  const maxPages = options.maxPages === undefined
    ? Math.ceil(targetCandles / pageLimit)
    : options.maxPages;
  const fetchPage = createBinanceKlinePageFetcher({ callTool, server, tool });
  const history = await fetchHistoricalKlines({
    fetchPage, symbol, interval, pageLimit, targetCandles,
    minCandles: targetCandles, maxPages, maxRetries, now,
    // Binance endTime is inclusive; exclude the currently forming candle.
    initialEndTime: Math.max(0, Math.floor(now / intervalMs) * intervalMs - 1),
    intervalMs,
    isHistoryExhausted: ({ page }) => Array.isArray(page) && page.length < pageLimit
  });
  const accepted = history.status === "COMPLETE" &&
    history.valid === true && history.rows.length >= targetCandles;
  return {
    accepted, status: history.status,
    rows: accepted ? history.rows.slice(-targetCandles) : [],
    history,
    reason: accepted ? null : buildBlockReason(history, targetCandles, interval)
  };
}

async function loadPerCoinBacktestHistory(options = {}) {
  return loadStrictBacktestHistory({
    ...options,
    interval: "4h",
    targetCandles: options.targetCandles === undefined ? DEFAULT_TARGET_CANDLES : options.targetCandles
  });
}

function buildBlockReason(history, targetCandles, interval) {
  const received = history && history.rows ? history.rows.length : 0;
  const status = history && history.status ? history.status : "UNKNOWN";
  return `Backtest blocked: historical ${interval} data status ${status}; required ${targetCandles} closed candles, received ${received}.`;
}

module.exports = {
  loadStrictBacktestHistory,
  loadPerCoinBacktestHistory,
  FOUR_HOURS_MS,
  ONE_DAY_MS,
  INTERVALS,
  DEFAULT_TARGET_CANDLES
};
