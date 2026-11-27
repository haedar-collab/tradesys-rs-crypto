# Per-Coin Backtest: Strict Historical Data Boundary

## Status

Isolated orchestration module and tests only. It is not yet wired into `index.html`.

## Policy

The per-coin backtest uses 4H Binance Spot klines. The strict history boundary accepts data only when:

- all pages pass row and candle validation;
- page ordering, cursor progression, and merged sequence are valid;
- all requested pages are fetched without unresolved errors;
- the target count (default 4,500 closed candles) is reached;
- the result status is exactly `COMPLETE`.

A shorter listing history is reported as `HISTORY_EXHAUSTED`, but is not accepted for this backtest sample. A fetch failure after one or more successful pages is `INCOMPLETE`. Malformed data is `INVALID`.

For every non-accepted result, the helper returns `rows: []`. This prevents accidental downstream use of partial data.

## Files

- `lib/per-coin-backtest-history.cjs`
- `tests/per-coin-backtest-history.test.cjs`

The helper composes the Binance MCP adapter and history fetcher. It explicitly configures the 4H interval as 14,400,000 ms and uses the Binance short-page condition as a terminal-history signal. A terminal history shorter than the target is still blocked.

## Integration boundary

The eventual browser integration must replace only the 4H pagination section inside `runCoinBt(sym)`. It must not change:

- `E.backtestCoin` or any strategy logic;
- Daily data preparation;
- regime selection;
- backtest execution assumptions;
- pooled backtest or live scan paths.

The caller must check `accepted` before invoking `E.backtestCoin`. If false, it must surface the status/reason and must not run the backtest.

## Validation

Run `npm test`. No production behavior changes until the browser integration mechanism is separately established and regression-tested.
