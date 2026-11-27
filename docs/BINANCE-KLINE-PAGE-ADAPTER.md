# Binance Kline Page Adapter

## Status

Isolated adapter and tests only. It is not imported by `index.html` and does not change production behavior.

## Purpose

Bridge the application's MCP connector contract:

`callTool(server, tool, input, options?)`

to the history fetcher's contract:

`fetchPage({ symbol, interval, limit, endTime? })`

## Contract

- For the first page, sends `symbol`, `interval`, and `limit`.
- For older pages, forwards the supplied `endTime` unchanged.
- Does not invent or silently add `startTime`.
- Unwraps the connector's optional `payload` property.
- Parses a JSON-string payload if the connector returns one.
- Rejects non-array payloads and malformed JSON strings.
- Propagates connector errors; it never converts failures into empty arrays.
- Does not add caching by default. Call options can be supplied explicitly.
- Validates the symbol, interval, limit (1–1000), and optional non-negative safe-integer `endTime`.

## Why this matters

The current browser provider's `provider.klines(symbol, interval, limit)` does not accept an `endTime` argument. The existing per-coin backtest bypasses it for older pages and calls the connector directly. The isolated adapter gives the history fetcher a testable and explicit connector boundary without modifying the live provider yet.

## Remaining integration work

Before any production integration:
1. Confirm the exact connector tool name returned at runtime.
2. Decide explicit cache policy for historical pages; default adapter behavior is no cache.
3. Connect the adapter to `createKlineHistoryFetcher` only in per-coin backtest.
4. Replace partial-history acceptance with a fail-closed status gate.
5. Test that incomplete/invalid history cannot be passed to `E.backtestCoin`.
6. Run regression tests confirming strategy outputs are unchanged for identical valid candle input.

## Tests

Run:

```bash
npm test
```
