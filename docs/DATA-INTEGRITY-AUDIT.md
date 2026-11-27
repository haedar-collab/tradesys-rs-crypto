# Data Integrity Audit — Baseline Findings

## Scope

This audit records what the current `series()` mapper in `index.html` does before a dedicated Strict / Fail-safe validator is implemented. These are characterization findings, not approval of the current behavior.

## Current behavior verified by tests

1. A candle is retained only when `Number(row[6]) < now`. The close-time boundary is exclusive.
2. `series()` maps Binance kline field 7 to `v` (quote-asset volume), not field 5 (base-asset volume).
3. The mapper converts fields to numbers but does not reject non-finite values, zero/negative prices, invalid OHLC relationships, or negative volume.
4. The mapper does not sort candles or reject duplicate / out-of-order timestamps.
5. The current return object has no `n` property; `prepare()` adds `n` later.

Items 3 and 4 are known data-integrity gaps under the selected Strict / Fail-safe policy. The characterization tests intentionally preserve evidence of the current behavior so it is not mistaken for an implemented safety control.

## Required validator contract (next implementation stage)

A separate validation layer should return structured results, without silently repairing input:

- `valid`: boolean
- `status`: `VALID`, `INVALID`, or `INSUFFICIENT`
- `errors`: stable machine-readable error codes
- `warnings`: non-blocking observations
- `stats`: input count, accepted count, rejected count, first/last timestamp, and interval diagnostics

At minimum, reject or block the affected symbol/timeframe when any required candle has:

- non-finite or non-positive OHLC prices;
- `high < max(open, close, low)`;
- `low > min(open, close, high)`;
- non-finite or negative volume;
- invalid timestamp or close time;
- duplicate or descending open timestamps;
- an unexpected interval gap, unless explicitly classified as an allowed exchange/session condition;
- a candle that is not closed at evaluation time.

Do not automatically drop malformed rows and continue as if the remaining series were complete. Report the reason and fail closed for the affected dependency.

## Scope of blocking

- Coin Daily / 4H failure blocks new actionable BUY signals for that coin.
- BTC Daily regime failure blocks BUY signals that depend on the global BTC regime.
- Missing 1H data blocks only a strategy path that actually requires its conditional 1H trigger.
- A coin-level failure must not disable unrelated coins.
- Position-management and risk-reduction alerts must remain available.

## Non-goals

- Do not change indicator formulas or playbook rules in this audit stage.
- Do not infer or fabricate missing candles.
- Do not interpolate, forward-fill, or silently sort timestamps.
- Do not treat a passing characterization test as proof that Strict / Fail-safe validation is implemented.
