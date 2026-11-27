"use strict";

/**
 * Strict validator for Binance Spot kline rows.
 *
 * This module is intentionally independent from the production engine.
 * It does not sort, repair, drop, interpolate, or mutate source rows.
 */
const CODES = Object.freeze({
  INPUT_NOT_ARRAY: "INPUT_NOT_ARRAY",
  NO_CANDLES: "NO_CANDLES",
  INVALID_OPTIONS: "INVALID_OPTIONS",
  ROW_SHAPE_INVALID: "ROW_SHAPE_INVALID",
  OPEN_TIME_INVALID: "OPEN_TIME_INVALID",
  CLOSE_TIME_INVALID: "CLOSE_TIME_INVALID",
  CLOSE_BEFORE_OPEN: "CLOSE_BEFORE_OPEN",
  CANDLE_NOT_CLOSED: "CANDLE_NOT_CLOSED",
  PRICE_NOT_FINITE: "PRICE_NOT_FINITE",
  PRICE_NOT_POSITIVE: "PRICE_NOT_POSITIVE",
  HIGH_BELOW_RANGE: "HIGH_BELOW_RANGE",
  LOW_ABOVE_RANGE: "LOW_ABOVE_RANGE",
  VOLUME_NOT_FINITE: "VOLUME_NOT_FINITE",
  VOLUME_NEGATIVE: "VOLUME_NEGATIVE",
  DUPLICATE_TIMESTAMP: "DUPLICATE_TIMESTAMP",
  TIMESTAMP_OUT_OF_ORDER: "TIMESTAMP_OUT_OF_ORDER",
  INTERVAL_GAP: "INTERVAL_GAP",
  INTERVAL_MISMATCH: "INTERVAL_MISMATCH",
  INSUFFICIENT_CANDLES: "INSUFFICIENT_CANDLES"
});

function issue(code, index = null, details = null) {
  return { code, index, ...(details == null ? {} : { details }) };
}

function validateKlines(rows, options = {}) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(rows)) {
    errors.push(issue(CODES.INPUT_NOT_ARRAY));
    return result(false, "INVALID", errors, warnings, {
      inputCount: 0, acceptedCount: 0, rejectedCount: 0,
      firstOpenTime: null, lastOpenTime: null,
      intervalDiagnostics: { expectedIntervalMs: null, observedIntervals: [] }
    });
  }

  const now = options.now == null ? Date.now() : Number(options.now);
  const intervalMs = options.intervalMs == null ? null : Number(options.intervalMs);
  const minCandles = options.minCandles == null ? 1 : Number(options.minCandles);

  if (!Number.isFinite(now) || (intervalMs != null && (!Number.isInteger(intervalMs) || intervalMs <= 0)) ||
      !Number.isInteger(minCandles) || minCandles < 1) {
    errors.push(issue(CODES.INVALID_OPTIONS));
    return result(false, "INVALID", errors, warnings, {
      inputCount: rows.length, acceptedCount: 0, rejectedCount: rows.length,
      firstOpenTime: null, lastOpenTime: null,
      intervalDiagnostics: { expectedIntervalMs: intervalMs, observedIntervals: [] }
    });
  }

  if (rows.length === 0) {
    errors.push(issue(CODES.NO_CANDLES));
    return result(false, "INSUFFICIENT", errors, warnings, {
      inputCount: 0, acceptedCount: 0, rejectedCount: 0,
      firstOpenTime: null, lastOpenTime: null,
      intervalDiagnostics: { expectedIntervalMs: intervalMs, observedIntervals: [] }
    });
  }

  const rejected = new Set();
  const openTimes = [];
  const observedIntervals = [];
  let previousOpen = null;

  rows.forEach((row, index) => {
    let rowInvalid = false;
    const add = (code, details = null) => {
      errors.push(issue(code, index, details));
      rowInvalid = true;
    };

    if (!Array.isArray(row) || row.length < 8) {
      add(CODES.ROW_SHAPE_INVALID, { minimumFields: 8 });
      rejected.add(index);
      openTimes.push(null);
      return;
    }

    const openTime = Number(row[0]);
    const closeTime = Number(row[6]);
    openTimes.push(Number.isFinite(openTime) ? openTime : null);

    if (!Number.isSafeInteger(openTime) || openTime < 0) add(CODES.OPEN_TIME_INVALID);
    if (!Number.isSafeInteger(closeTime) || closeTime < 0) add(CODES.CLOSE_TIME_INVALID);
    if (Number.isSafeInteger(openTime) && Number.isSafeInteger(closeTime)) {
      if (closeTime < openTime) add(CODES.CLOSE_BEFORE_OPEN);
      if (closeTime >= now) add(CODES.CANDLE_NOT_CLOSED, { closeTime, evaluationTime: now });
    }

    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const baseVolume = Number(row[5]);
    const quoteVolume = Number(row[7]);
    const prices = [open, high, low, close];

    if (prices.some(value => !Number.isFinite(value))) add(CODES.PRICE_NOT_FINITE);
    else {
      if (prices.some(value => value <= 0)) add(CODES.PRICE_NOT_POSITIVE);
      if (high < Math.max(open, close, low)) add(CODES.HIGH_BELOW_RANGE);
      if (low > Math.min(open, close, high)) add(CODES.LOW_ABOVE_RANGE);
    }

    const volumes = [baseVolume, quoteVolume];
    if (volumes.some(value => !Number.isFinite(value))) add(CODES.VOLUME_NOT_FINITE);
    else if (volumes.some(value => value < 0)) add(CODES.VOLUME_NEGATIVE);

    if (Number.isSafeInteger(openTime)) {
      if (previousOpen != null) {
        const delta = openTime - previousOpen;
        observedIntervals.push(delta);
        if (delta === 0) add(CODES.DUPLICATE_TIMESTAMP, { openTime });
        else if (delta < 0) add(CODES.TIMESTAMP_OUT_OF_ORDER, { previousOpenTime: previousOpen, openTime });
        else if (intervalMs != null && delta > intervalMs) {
          add(CODES.INTERVAL_GAP, { expectedIntervalMs: intervalMs, observedIntervalMs: delta });
        } else if (intervalMs != null && delta !== intervalMs) {
          add(CODES.INTERVAL_MISMATCH, { expectedIntervalMs: intervalMs, observedIntervalMs: delta });
        }
      }
      previousOpen = openTime;
    }

    if (rowInvalid) rejected.add(index);
  });

  const acceptedCount = rows.length - rejected.size;
  if (acceptedCount < minCandles) {
    errors.push(issue(CODES.INSUFFICIENT_CANDLES, null, { required: minCandles, available: acceptedCount }));
  }

  const invalid = errors.some(item => item.code !== CODES.INSUFFICIENT_CANDLES);
  const status = invalid ? "INVALID" : acceptedCount < minCandles ? "INSUFFICIENT" : "VALID";

  return result(status === "VALID", status, errors, warnings, {
    inputCount: rows.length,
    acceptedCount,
    rejectedCount: rejected.size,
    firstOpenTime: openTimes.find(value => value != null) ?? null,
    lastOpenTime: [...openTimes].reverse().find(value => value != null) ?? null,
    intervalDiagnostics: { expectedIntervalMs: intervalMs, observedIntervals }
  });
}

function result(valid, status, errors, warnings, stats) {
  return { valid, status, errors, warnings, stats };
}

module.exports = { validateKlines, CODES };
