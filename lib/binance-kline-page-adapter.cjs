"use strict";

/**
 * Adapts the application's Binance MCP callTool contract to the
 * fetchPage({ symbol, interval, limit, endTime? }) contract used by
 * kline-history-fetcher.cjs.
 *
 * This module is intentionally isolated and is not wired into index.html.
 */
function createBinanceKlinePageFetcher(options = {}) {
  const { callTool, server, tool, callOptions } = options;

  if (typeof callTool !== "function") {
    throw new TypeError("callTool must be a function");
  }
  if (typeof server !== "string" || !server.trim()) {
    throw new TypeError("server must be a non-empty string");
  }
  if (typeof tool !== "string" || !tool.trim()) {
    throw new TypeError("tool must be a non-empty string");
  }

  return async function fetchPage(request = {}) {
    const { symbol, interval, limit, endTime } = request;
    if (typeof symbol !== "string" || !symbol.trim()) {
      throw new TypeError("symbol must be a non-empty string");
    }
    if (typeof interval !== "string" || !interval.trim()) {
      throw new TypeError("interval must be a non-empty string");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new RangeError("limit must be an integer between 1 and 1000");
    }
    if (endTime !== undefined && (!Number.isSafeInteger(endTime) || endTime < 0)) {
      throw new RangeError("endTime must be a non-negative safe integer");
    }

    const input = { symbol, interval, limit };
    if (endTime !== undefined) input.endTime = endTime;

    // Do not silently enable a cache: historical pages must reflect the
    // requested cursor and fresh provider response.
    const response = callOptions === undefined
      ? await callTool(server, tool, input)
      : await callTool(server, tool, input, callOptions);

    let payload = response && response.payload !== undefined
      ? response.payload
      : response;

    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (error) {
        throw new Error("Binance kline response was a non-JSON string");
      }
    }

    if (!Array.isArray(payload)) {
      throw new Error("Binance kline response payload must be an array");
    }

    return payload;
  };
}

module.exports = { createBinanceKlinePageFetcher };
