"use strict";

/**
 * Deterministic orchestration for backward Binance kline pagination.
 * Network access is injected through fetchPage; this module never performs IO.
 */
const { mergeKlinePages, nextOlderEndTime, assertOlderCursorProgress } = require("./kline-page-merger.cjs");
const { validateKlines } = require("./market-data-validator.cjs");

async function fetchHistoricalKlines(options = {}) {
  const {
    fetchPage,
    symbol,
    interval,
    pageLimit = 1000,
    targetCandles = 4500,
    minCandles = 1,
    maxPages = 5,
    maxRetries = 1,
    now = Date.now(),
    intervalMs = null,
    isHistoryExhausted
  } = options;

  const invalid = validateOptions({
    fetchPage, symbol, interval, pageLimit, targetCandles,
    minCandles, maxPages, maxRetries, now, intervalMs, isHistoryExhausted
  });
  if (invalid) {
    return {
      valid: false,
      status: "INVALID",
      rows: [],
      errors: [{ code: "INVALID_OPTIONS", message: invalid }],
      warnings: [],
      stats: emptyStats(targetCandles, minCandles),
      pagination: emptyPagination("INVALID_OPTIONS")
    };
  }

  // Retrieved newest-to-oldest; reverse page order only (never reorder candles).
  const newestFirstPages = [];
  const cursorHistory = [];
  const pageSizes = [];
  let retryCount = 0;
  let fetchError = null;
  let fatalError = null;
  let historyExhausted = false;
  let stopReason = "MAX_PAGES";
  let nextEndTime = null;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    let page = null;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        page = await fetchPage({
          symbol,
          interval,
          limit: pageLimit,
          ...(nextEndTime == null ? {} : { endTime: nextEndTime })
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) retryCount += 1;
      }
    }

    if (lastError) {
      fetchError = errorMessage(lastError);
      stopReason = "FETCH_FAILED";
      break;
    }

    if (!Array.isArray(page)) {
      newestFirstPages.push(page);
      pageSizes.push(null);
      stopReason = "INVALID_PAGE";
      break;
    }

    if (page.length > pageLimit) {
      newestFirstPages.push(page);
      pageSizes.push(page.length);
      stopReason = "PAGE_EXCEEDS_LIMIT";
      fatalError = "Binance page exceeded the requested limit";
      break;
    }

    if (page.length === 0) {
      historyExhausted = await confirmHistoryExhausted(isHistoryExhausted, {
        page, pageIndex, pageLimit, pagesFetched: newestFirstPages.length,
        symbol, interval, endTime: nextEndTime
      });
      stopReason = historyExhausted ? "HISTORY_EXHAUSTED" : "EMPTY_PAGE_UNCONFIRMED";
      break;
    }

    newestFirstPages.push(page);
    pageSizes.push(page.length);

    const pageCheck = validateKlines(page, {
      now,
      ...(intervalMs == null ? {} : { intervalMs }),
      minCandles: 1
    });
    if (pageCheck.status !== "VALID") {
      stopReason = "INVALID_PAGE_DATA";
      break;
    }

    const received = newestFirstPages.reduce((sum, rows) => sum + rows.length, 0);
    if (received >= targetCandles) {
      stopReason = "TARGET_REACHED";
      break;
    }

    if (page.length < pageLimit) {
      historyExhausted = await confirmHistoryExhausted(isHistoryExhausted, {
        page, pageIndex, pageLimit, pagesFetched: newestFirstPages.length,
        symbol, interval, endTime: nextEndTime
      });
      stopReason = historyExhausted ? "HISTORY_EXHAUSTED" : "SHORT_PAGE_UNCONFIRMED";
      break;
    }

    const oldestOpenTime = Number(page[0][0]);
    const cursor = nextOlderEndTime(oldestOpenTime);
    if (cursor == null) {
      historyExhausted = await confirmHistoryExhausted(isHistoryExhausted, {
        page, pageIndex, pageLimit, pagesFetched: newestFirstPages.length,
        symbol, interval, endTime: nextEndTime
      });
      stopReason = historyExhausted ? "HISTORY_EXHAUSTED" : "EARLIEST_TIMESTAMP_REACHED";
      break;
    }
    if (nextEndTime != null) {
      try {
        assertOlderCursorProgress(nextEndTime, cursor);
      } catch (error) {
        stopReason = "CURSOR_NOT_PROGRESSING";
        fatalError = errorMessage(error);
        break;
      }
    }
    nextEndTime = cursor;
    cursorHistory.push(cursor);
  }

  const oldestFirstPages = newestFirstPages.slice().reverse();
  const merged = mergeKlinePages(oldestFirstPages, {
    now,
    ...(intervalMs == null ? {} : { intervalMs }),
    targetCandles,
    minCandles,
    historyExhausted,
    ...(fetchError == null ? {} : { fetchError })
  });

  let result = merged;
  if (fatalError != null) {
    result = {
      ...merged,
      status: "INVALID",
      valid: false,
      errors: [...merged.errors, { code: "PAGINATION_INVARIANT_FAILED", message: fatalError }],
      stats: { ...merged.stats, fetchFailed: false }
    };
  }
  // A failed first request yields no pages; preserve the fetch failure explicitly.
  if (fetchError != null && oldestFirstPages.length === 0) {
    result = {
      ...merged,
      status: "INCOMPLETE",
      valid: false,
      warnings: [...merged.warnings, { code: "FETCH_FAILED", reason: fetchError }],
      stats: { ...merged.stats, fetchFailed: true }
    };
  }

  return {
    ...result,
    pagination: {
      requestedCount: targetCandles,
      receivedCount: result.rows.length,
      pageCount: newestFirstPages.length,
      pageSizes,
      retryCount,
      maxRetries,
      maxPages,
      cursorHistory,
      historyExhausted,
      fetchFailed: fetchError != null,
      fetchError,
      stopReason
    }
  };
}

function validateOptions(o) {
  if (typeof o.fetchPage !== "function") return "fetchPage must be a function";
  if (typeof o.symbol !== "string" || !o.symbol.trim()) return "symbol is required";
  if (typeof o.interval !== "string" || !o.interval.trim()) return "interval is required";
  if (!Number.isSafeInteger(o.pageLimit) || o.pageLimit < 1) return "pageLimit must be a positive integer";
  if (!Number.isSafeInteger(o.targetCandles) || o.targetCandles < 1) return "targetCandles must be a positive integer";
  if (!Number.isSafeInteger(o.minCandles) || o.minCandles < 1) return "minCandles must be a positive integer";
  if (!Number.isSafeInteger(o.maxPages) || o.maxPages < 1) return "maxPages must be a positive integer";
  if (!Number.isSafeInteger(o.maxRetries) || o.maxRetries < 0) return "maxRetries must be a non-negative integer";
  if (!Number.isFinite(o.now)) return "now must be finite";
  if (o.intervalMs != null && (!Number.isSafeInteger(o.intervalMs) || o.intervalMs <= 0)) return "intervalMs must be a positive integer";
  if (o.isHistoryExhausted != null && typeof o.isHistoryExhausted !== "function") return "isHistoryExhausted must be a function";
  return null;
}

async function confirmHistoryExhausted(callback, context) {
  if (typeof callback !== "function") return false;
  try {
    return (await callback(context)) === true;
  } catch (_) {
    return false;
  }
}

function errorMessage(error) {
  return error && error.message ? String(error.message) : String(error);
}

function emptyStats(targetCandles, minCandles) {
  return {
    pageCount: 0,
    receivedCount: 0,
    targetCandles,
    targetReached: false,
    minCandles,
    enoughCandles: false,
    historyExhausted: false,
    fetchFailed: false,
    oldestOpenTime: null,
    newestOpenTime: null
  };
}

function emptyPagination(stopReason) {
  return {
    requestedCount: null,
    receivedCount: 0,
    pageCount: 0,
    pageSizes: [],
    retryCount: 0,
    maxRetries: null,
    maxPages: null,
    cursorHistory: [],
    historyExhausted: false,
    fetchFailed: false,
    fetchError: null,
    stopReason
  };
}

module.exports = { fetchHistoricalKlines };
