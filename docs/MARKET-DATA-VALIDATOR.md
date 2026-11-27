# Market Data Validator — Isolated Implementation

## Status

The first Strict / Fail-safe validator is implemented as an independent CommonJS module at `lib/market-data-validator.cjs`. It is not yet wired into `index.html`, scanning, signal generation, notifications, or backtesting.

## Contract

`validateKlines(rows, options)` accepts Binance Spot kline arrays and returns:

- `valid`: true only when the dataset is valid and meets the requested minimum candle count;
- `status`: `VALID`, `INVALID`, or `INSUFFICIENT`;
- `errors`: stable machine-readable codes with row index and optional details;
- `warnings`: reserved for non-blocking observations;
- `stats`: input / accepted / rejected counts, first / last valid open time, and interval diagnostics.

Options:

- `now`: evaluation timestamp in milliseconds; defaults to `Date.now()`;
- `intervalMs`: expected open-time spacing in milliseconds; when omitted, interval gaps are not inferred;
- `minCandles`: minimum number of accepted rows; defaults to 1.

## Fail-closed behavior

The validator does not sort, drop, interpolate, forward-fill, or mutate input rows. Any malformed candle or sequence error makes the complete dataset `INVALID`. If there are no data errors but fewer than `minCandles` accepted rows, status is `INSUFFICIENT`.

The close-time rule is exclusive: a candle is closed only when `closeTime < now`.

## Validation coverage

- Row shape and timestamp validity;
- candle close-time status;
- finite, positive OHLC prices;
- high / low consistency with open, close, and range;
- finite, non-negative base and quote volume;
- duplicate and descending open timestamps;
- exact interval spacing when `intervalMs` is supplied;
- minimum accepted candle count.

## Integration boundary

This module is deliberately isolated. Do not connect it to production signal paths until interval mappings for every supported Binance timeframe, historical API edge cases, and failure propagation have been reviewed. Integration must block only the affected symbol / timeframe, with BTC Daily failure propagated only to signals that depend on BTC regime. Risk-reduction and position-management alerts must remain available.

## Verification

Run `npm test`. The validator tests use synthetic Binance-format klines and do not require network access.
