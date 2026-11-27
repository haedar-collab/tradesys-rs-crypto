# Binance Historical Kline Retrieval — Audit

## Scope

Read-only audit of the existing browser-side Binance Spot kline retrieval and historical backtest pagination. No production code was changed by this audit.

## Binance API contract

The official Spot REST documentation states:

- `GET /api/v3/klines` identifies candles by open time.
- The maximum `limit` is 1,000.
- Results are chronological.
- With `endTime`, the API returns the most recent records up to that time and limit.
- Timestamps are milliseconds by default.
- Supported intervals include fixed durations (for example `15m`, `1h`, `4h`, `1d`) and calendar `1M`.

References:
- https://developers.binance.com/en/docs/products/spot/rest-api
- https://binance.github.io/binance-connector-js/interfaces/_binance_spot.SpotRestAPI.MarketApiInterface.html

## Existing implementation findings

### 1. Standard provider fetch

The shared provider requests one page and passes through the raw array:

`provider.klines(symbol, interval, limit)`

It does not itself validate row count, chronological order, gaps, duplicate timestamps, close-time semantics, or whether the last candle is closed. The isolated validator is not yet called here.

Impact: every caller must currently trust provider output or validate independently. This is a known integration gap, not a claim that Binance normally returns malformed data.

### 2. Per-coin 4H backtest pagination

The existing per-coin backtest:
- fetches a latest page of 1,000 4H candles;
- requests older pages with `endTime = oldestOpenTime - 1`;
- prepends older pages;
- stops after reaching at least 4,500 rows, five pages, a short page, or a fetch error;
- flattens and keeps the latest 4,500 rows.

The `oldestOpenTime - 1` cursor is a sensible exclusive-boundary technique for avoiding the boundary candle being requested again when the API's end-time bound is inclusive.

However, there are material fail-safe gaps:
- A failed older-page request is caught and converted to a break; the partial history is still passed to the backtest.
- No explicit validation is performed on each page or on the merged sequence.
- No explicit assertion confirms that the requested target history (4,500 rows) was actually reached.
- No pagination audit metadata is stored with the backtest result.
- A short page is treated as end-of-history without a separate distinction between genuine listing history exhaustion and an unexpectedly incomplete response.

Impact: backtests can silently run on less history than requested. This does not directly create a live BUY signal, but it can make backtest evidence incomplete or misleading.

### 3. Pooled backtest

The pooled backtest fetches only one page per symbol (1,000 4H and 400 Daily) and does not paginate. This is consistent with its approximate sample-size comment, but must not be described as a multi-year full-history test. Per-coin and pooled backtests have different history depth.

### 4. Other data paths

- Main scan fetches 500 BTC Daily, 300 BTC 4H, 80 ETHBTC Daily, 300 altcoin Daily, 300 altcoin 4H, and conditional 200 altcoin 1H.
- Early candidates fetch 200 15m candles.
- Chart display fetches 300 candles for a selected timeframe.
- On-demand SMC fetches 300 4H, 300 Daily, and optional 200 1H.
- These are single-page requests. They are not pagination bugs if the requested sample is intentionally limited, but every path still needs the same data-integrity gate before strategy calculations.

## Recommended design — no production integration yet

1. Define one canonical interval registry for currently used fixed intervals: `15m`, `1h`, `4h`, and `1d`. Do not infer `1M` from a fixed millisecond duration.
2. Add a pure historical-page merger that:
   - accepts pages in a documented oldest-to-newest order; the fetch orchestration may retrieve newest-to-oldest and reverse only the page list, never candle rows;
   - validates each page;
   - validates chronological continuity after concatenation;
   - rejects duplicate open times, overlapping pages, gaps, malformed rows, and non-progressing cursors;
   - reports requested count, received count, page count, oldest/newest open time, and whether the target count was reached.
3. Make page failure explicit: `COMPLETE`, `HISTORY_EXHAUSTED`, `INCOMPLETE`, or `INVALID`. Never silently treat `INCOMPLETE` as a successful full-history backtest.
4. Keep partial-history analysis available only when explicitly labeled as partial and excluded from any minimum-sample verdict. For the user's Strict / Fail-safe policy, the default backtest verdict should be unavailable when required history is incomplete.
5. Keep this validator at the data boundary. Do not modify strategy rules, signal thresholds, or algorithm behavior in this stage.

## Test plan before integration

Use deterministic synthetic Binance-format fixtures; no live API dependency:
- exact 1,000-row page followed by older page;
- correct non-overlapping boundary using `oldestOpenTime - 1`;
- duplicate overlap;
- missing interval between pages;
- reversed page order;
- empty older page;
- short oldest page representing history exhaustion;
- fetch failure after one or more successful pages;
- cursor that fails to move backward;
- exact requested count reached;
- fewer than requested rows with explicit incomplete/exhausted status;
- invalid row inside an otherwise valid page;
- forming last candle excluded from closed-candle analysis.

## Decision

The existing pagination cursor is directionally sound, but the implementation is not yet Strict / Fail-safe because it can return a partial historical sample after a page-fetch failure without marking the result incomplete. The next safe task is to implement and test the isolated page-merging/status helper, not to change the production backtest or signal paths.
