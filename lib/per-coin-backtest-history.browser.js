"use strict";
(function (root) {
  const INTERVAL_MS = 4 * 60 * 60 * 1000;
  const TARGET_CANDLES = 4500;
  const PAGE_LIMIT = 1000;

  function unwrap(response) {
    let value = response && response.payload !== undefined ? response.payload : response;
    if (typeof value === "string") {
      try { value = JSON.parse(value); }
      catch (_) { throw new Error("Binance kline response was a non-JSON string"); }
    }
    if (!Array.isArray(value)) throw new Error("Binance kline response payload must be an array");
    return value;
  }

  function validatePage(rows, now) {
    if (!Array.isArray(rows) || rows.length === 0) return "EMPTY_OR_INVALID_PAGE";
    let previousOpen = null;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 12) return "MALFORMED_KLINE_ROW";
      const openTime = Number(row[0]), closeTime = Number(row[6]);
      const open = Number(row[1]), high = Number(row[2]), low = Number(row[3]), close = Number(row[4]);
      const volume = Number(row[5]), quoteVolume = Number(row[7]);
      if (!Number.isSafeInteger(openTime) || openTime < 0 ||
          !Number.isSafeInteger(closeTime) || closeTime !== openTime + INTERVAL_MS - 1 ||
          closeTime >= now) return "INVALID_OR_OPEN_CANDLE";
      if (![open, high, low, close].every(Number.isFinite) ||
          Math.min(open, high, low, close) <= 0 || high < Math.max(open, close, low) ||
          low > Math.min(open, close, high)) return "INVALID_OHLC";
      if (!Number.isFinite(volume) || volume < 0 ||
          !Number.isFinite(quoteVolume) || quoteVolume < 0) return "INVALID_VOLUME";
      if (previousOpen !== null && openTime !== previousOpen + INTERVAL_MS) {
        return openTime <= previousOpen ? "DUPLICATE_OR_OUT_OF_ORDER" : "INTERVAL_GAP";
      }
      previousOpen = openTime;
    }
    return null;
  }

  async function load(options) {
    const o = options || {};
    const callTool = o.callTool, server = o.server, tool = o.tool, symbol = o.symbol;
    const now = o.now === undefined ? Date.now() : o.now;
    const target = o.targetCandles === undefined ? TARGET_CANDLES : o.targetCandles;
    const pageLimit = o.pageLimit === undefined ? PAGE_LIMIT : o.pageLimit;
    const maxPages = o.maxPages === undefined ? 5 : o.maxPages;
    const maxRetries = o.maxRetries === undefined ? 1 : o.maxRetries;
    const blocked = (status, reason, pages, received) => ({
      accepted: false, status, rows: [], reason,
      pagination: { pageCount: pages, receivedCount: received, targetCandles: target }
    });
    if (typeof callTool !== "function" || typeof server !== "string" || !server ||
        typeof tool !== "string" || !tool || typeof symbol !== "string" || !symbol ||
        !Number.isFinite(now) || !Number.isSafeInteger(target) || target < 1 ||
        !Number.isSafeInteger(pageLimit) || pageLimit < 1 || pageLimit > 1000 ||
        !Number.isSafeInteger(maxPages) || maxPages < 1 ||
        !Number.isSafeInteger(maxRetries) || maxRetries < 0) {
      return blocked("INVALID", "Invalid strict-history options", 0, 0);
    }

    const pagesNewestFirst = [];
    // Binance endTime is inclusive; start at the last fully closed 4H candle.
    let endTime = Math.max(0, Math.floor(now / INTERVAL_MS) * INTERVAL_MS - 1);
    let retryCount = 0;
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      let page, lastError;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const input = { symbol, interval: "4h", limit: pageLimit };
          if (endTime !== undefined) input.endTime = endTime;
          page = unwrap(await callTool(server, tool, input));
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries) retryCount += 1;
        }
      }
      if (lastError) return blocked("INCOMPLETE", "Historical page fetch failed: " + String(lastError.message || lastError), pagesNewestFirst.length, pagesNewestFirst.reduce((n,p)=>n+p.length,0));
      if (page.length === 0) return blocked("HISTORY_EXHAUSTED", "Binance history ended before the required sample was reached", pagesNewestFirst.length, pagesNewestFirst.reduce((n,p)=>n+p.length,0));
      if (page.length > pageLimit) return blocked("INVALID", "Binance page exceeded requested limit", pagesNewestFirst.length, 0);
      const invalid = validatePage(page, now);
      if (invalid) return blocked("INVALID", "Historical page rejected: " + invalid, pagesNewestFirst.length, 0);

      if (pagesNewestFirst.length) {
        const newerPage = pagesNewestFirst[pagesNewestFirst.length - 1];
        const expectedNewerOpen = Number(newerPage[0][0]);
        const actualOlderOpen = Number(page[page.length - 1][0]);
        if (actualOlderOpen + INTERVAL_MS !== expectedNewerOpen) {
          return blocked("INVALID", "Historical pages overlap, reverse, or contain a gap", pagesNewestFirst.length + 1, 0);
        }
      }
      pagesNewestFirst.push(page);
      const received = pagesNewestFirst.reduce((n,p)=>n+p.length,0);
      if (received >= target) {
        const rows = pagesNewestFirst.slice().reverse().flat();
        const selected = rows.slice(-target);
        const sequenceError = validatePage(selected, now);
        if (sequenceError) return blocked("INVALID", "Merged history rejected: " + sequenceError, pagesNewestFirst.length, received);
        return {
          accepted: true, status: "COMPLETE", rows: selected, reason: null,
          pagination: { pageCount: pagesNewestFirst.length, receivedCount: received, targetCandles: target, retryCount }
        };
      }
      if (page.length < pageLimit) {
        return blocked("HISTORY_EXHAUSTED", "Binance returned a short page before the required sample was reached", pagesNewestFirst.length, received);
      }
      const oldestOpenTime = Number(page[0][0]);
      if (!Number.isSafeInteger(oldestOpenTime) || oldestOpenTime <= 0) {
        return blocked("INVALID", "Cannot advance the historical cursor", pagesNewestFirst.length, received);
      }
      const nextEndTime = oldestOpenTime - 1;
      if (endTime !== undefined && nextEndTime >= endTime) {
        return blocked("INVALID", "Historical cursor did not move backwards", pagesNewestFirst.length, received);
      }
      endTime = nextEndTime;
    }
    const received = pagesNewestFirst.reduce((n,p)=>n+p.length,0);
    return blocked("INCOMPLETE", "Maximum historical page count reached before target", pagesNewestFirst.length, received);
  }

  root.TradesysPerCoinBacktestHistory = Object.freeze({ load, INTERVAL_MS, TARGET_CANDLES, PAGE_LIMIT });
  if (typeof module === "object" && module.exports) module.exports = root.TradesysPerCoinBacktestHistory;
})(typeof globalThis !== "undefined" ? globalThis : this);
