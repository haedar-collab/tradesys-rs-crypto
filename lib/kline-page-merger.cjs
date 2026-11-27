"use strict";

/**
 * Strict merger for paginated Binance Spot kline responses.
 *
 * Contract:
 * - pages are supplied oldest-to-newest;
 * - each page is the raw Binance kline array;
 * - rows are never sorted, dropped, repaired, or mutated;
 * - an empty terminal page is accepted only with historyExhausted: true;
 * - a short page is NOT interpreted as history exhaustion by this module:
 *   the caller must explicitly set historyExhausted after applying the
 *   provider's pagination contract.
 *
 * This module is intentionally independent from production code and network IO.
 */
const { validateKlines } = require("./market-data-validator.cjs");

const ERROR_CODES = Object.freeze({
  INPUT_NOT_ARRAY: "PAGES_NOT_ARRAY",
  NO_PAGES: "NO_PAGES",
  INVALID_OPTIONS: "INVALID_OPTIONS",
  PAGE_NOT_ARRAY: "PAGE_NOT_ARRAY",
  EMPTY_PAGE_NOT_TERMINAL: "EMPTY_PAGE_NOT_TERMINAL",
  EMPTY_PAGE_UNCONFIRMED: "EMPTY_PAGE_UNCONFIRMED",
  PAGE_INVALID: "PAGE_INVALID",
  MERGED_SEQUENCE_INVALID: "MERGED_SEQUENCE_INVALID",
  INSUFFICIENT_CANDLES: "INSUFFICIENT_CANDLES"
});

function nextOlderEndTime(oldestOpenTime) {
  const value = Number(oldestOpenTime);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("oldestOpenTime must be a non-negative safe integer");
  }
  return value === 0 ? null : value - 1;
}

function mergeKlinePages(pages, options = {}) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(pages)) {
    return finish("INVALID", false, [], errors.concat({
      code: ERROR_CODES.INPUT_NOT_ARRAY,
      pageIndex: null
    }), warnings, emptyStats());
  }
  if (pages.length === 0) {
    return finish("INCOMPLETE", false, [], errors.concat({
      code: ERROR_CODES.NO_PAGES,
      pageIndex: null
    }), warnings, emptyStats());
  }

  const now = options.now == null ? Date.now() : Number(options.now);
  const intervalMs = options.intervalMs == null ? null : Number(options.intervalMs);
  const minCandles = options.minCandles == null ? 1 : Number(options.minCandles);
  const targetCandles = options.targetCandles == null ? null : Number(options.targetCandles);
  const historyExhausted = options.historyExhausted === true;
  const fetchFailed = options.fetchError != null && options.fetchError !== false;

  if (!Number.isFinite(now) ||
      (intervalMs != null && (!Number.isSafeInteger(intervalMs) || intervalMs <= 0)) ||
      !Number.isSafeInteger(minCandles) || minCandles < 1 ||
      (targetCandles != null && (!Number.isSafeInteger(targetCandles) || targetCandles < 1)) ||
      (options.historyExhausted != null && typeof options.historyExhausted !== "boolean")) {
    return finish("INVALID", false, [], [{
      code: ERROR_CODES.INVALID_OPTIONS,
      pageIndex: null
    }], warnings, emptyStats({ pageCount: pages.length }));
  }

  const merged = [];
  let emptyTerminalPage = false;

  pages.forEach((page, pageIndex) => {
    if (!Array.isArray(page)) {
      errors.push({ code: ERROR_CODES.PAGE_NOT_ARRAY, pageIndex });
      return;
    }
    if (page.length === 0) {
      const isLast = pageIndex === pages.length - 1;
      if (!isLast) {
        errors.push({ code: ERROR_CODES.EMPTY_PAGE_NOT_TERMINAL, pageIndex });
      } else if (!historyExhausted) {
        warnings.push({ code: ERROR_CODES.EMPTY_PAGE_UNCONFIRMED, pageIndex });
        emptyTerminalPage = true;
      } else {
        emptyTerminalPage = true;
      }
      return;
    }

    const pageResult = validateKlines(page, {
      now,
      ...(intervalMs == null ? {} : { intervalMs }),
      minCandles: 1
    });
    if (pageResult.status !== "VALID") {
      errors.push({
        code: ERROR_CODES.PAGE_INVALID,
        pageIndex,
        details: pageResult.errors
      });
      return;
    }
    merged.push(...page);
  });

  if (errors.length > 0) {
    return finish("INVALID", false, merged, errors, warnings,
      buildStats(pages, merged, targetCandles, minCandles, historyExhausted, fetchFailed));
  }

  const mergedResult = validateKlines(merged, {
    now,
    ...(intervalMs == null ? {} : { intervalMs }),
    minCandles: 1
  });
  if (mergedResult.status !== "VALID") {
    errors.push({
      code: ERROR_CODES.MERGED_SEQUENCE_INVALID,
      pageIndex: null,
      details: mergedResult.errors
    });
    return finish("INVALID", false, merged, errors, warnings,
      buildStats(pages, merged, targetCandles, minCandles, historyExhausted, fetchFailed));
  }

  const targetReached = targetCandles != null && merged.length >= targetCandles;
  const enoughCandles = merged.length >= minCandles;
  if (!enoughCandles) {
    warnings.push({
      code: ERROR_CODES.INSUFFICIENT_CANDLES,
      required: minCandles,
      available: merged.length
    });
  }
  if (fetchFailed) {
    warnings.push({ code: "FETCH_FAILED", reason: String(options.fetchError) });
    return finish("INCOMPLETE", false, merged, errors, warnings,
      buildStats(pages, merged, targetCandles, minCandles, historyExhausted, true));
  }
  if (targetReached) {
    return finish("COMPLETE", enoughCandles, merged, errors, warnings,
      buildStats(pages, merged, targetCandles, minCandles, historyExhausted, false));
  }
  if (historyExhausted) {
    return finish("HISTORY_EXHAUSTED", enoughCandles, merged, errors, warnings,
      buildStats(pages, merged, targetCandles, minCandles, true, false));
  }
  if (emptyTerminalPage) {
    return finish("INCOMPLETE", false, merged, errors, warnings,
      buildStats(pages, merged, targetCandles, minCandles, false, false));
  }

  warnings.push({ code: "TARGET_NOT_REACHED", targetCandles, receivedCount: merged.length });
  return finish("INCOMPLETE", false, merged, errors, warnings,
    buildStats(pages, merged, targetCandles, minCandles, false, false));
}

function emptyStats(extra = {}) {
  return {
    pageCount: 0,
    receivedCount: 0,
    targetCandles: null,
    targetReached: false,
    minCandles: null,
    enoughCandles: false,
    historyExhausted: false,
    fetchFailed: false,
    oldestOpenTime: null,
    newestOpenTime: null,
    ...extra
  };
}

function buildStats(pages, rows, targetCandles, minCandles, historyExhausted, fetchFailed) {
  return {
    pageCount: pages.length,
    receivedCount: rows.length,
    targetCandles,
    targetReached: targetCandles != null && rows.length >= targetCandles,
    minCandles,
    enoughCandles: rows.length >= minCandles,
    historyExhausted,
    fetchFailed,
    oldestOpenTime: rows.length ? Number(rows[0][0]) : null,
    newestOpenTime: rows.length ? Number(rows[rows.length - 1][0]) : null
  };
}

function finish(status, valid, rows, errors, warnings, stats) {
  return { valid, status, rows, errors, warnings, stats };
}

module.exports = { mergeKlinePages, nextOlderEndTime, ERROR_CODES };
