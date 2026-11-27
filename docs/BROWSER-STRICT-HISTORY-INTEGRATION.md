# Browser Strict History Integration

## Scope
The browser-compatible helper at `lib/per-coin-backtest-history.browser.js` is loaded before the application script in `index.html`. It exposes `window.TradesysPerCoinBacktestHistory.load()`.

The integration is deliberately limited to `runCoinBt(sym)`, the per-coin 4H backtest path.

## Fail-safe behavior
- Requires 4,500 contiguous, valid, closed 4H candles.
- Requests up to five Binance pages of at most 1,000 candles, moving backward with `endTime = oldestOpenTime - 1`.
- Retries a failed page once by default.
- Blocks the backtest on fetch failure, short/empty history before the target, malformed rows, open candles, duplicate/out-of-order candles, gaps, page overlap, or cursor failure.
- On any rejected history, stores a diagnostic error/status in the per-coin backtest result and does not call `E.backtestCoin()`.
- On accepted history, passes the selected 4,500 rows to the existing `E.backtestCoin(r4,d,b.p,b.tl,sym,reg,CFG)` call without changing its arguments.

## Unchanged paths
- Strategy and indicator algorithms.
- Daily history fetch and BTC regime context.
- Main scanner, pooled backtest, signals, notifications, and trade execution.
- No automated orders are introduced.

## Implementation note
The browser helper is a standalone browser-compatible implementation of the strict history boundary. Its behavior is covered separately from the CommonJS helper, and static integration tests verify that the application loads it before use and checks acceptance before invoking the backtest engine. Keep both test suites aligned when changing pagination or validation rules.
