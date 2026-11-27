# Kline Page Merger

## Purpose

`lib/kline-page-merger.cjs` is an isolated, pure helper for validating and combining paginated Binance Spot Kline responses. It is not imported by `index.html` and performs no network requests.

## Input contract

`mergeKlinePages(pages, options)` expects:

- `pages`: raw Binance kline response arrays ordered **oldest page to newest page**.
- `options.now`: evaluation timestamp in milliseconds.
- `options.intervalMs`: optional fixed interval in milliseconds. Do not use a fixed millisecond value for Binance calendar interval `1M`.
- `options.targetCandles`: desired total candle count.
- `options.minCandles`: minimum count acceptable for analysis (default 1).
- `options.historyExhausted`: set to true only when the retrieval layer has evidence that no older history remains.
- `options.fetchError`: non-null value when a page request failed.

Pages and rows are not sorted, deduplicated, dropped, repaired, interpolated, or mutated.

An empty page is accepted only as the final page and only when `historyExhausted: true`. A short page is not automatically treated as history exhaustion: the caller must explicitly decide that based on the API response and retrieval contract.

## Statuses

| Status | Meaning |
|---|---|
| `COMPLETE` | Valid merged sequence reached `targetCandles`. |
| `HISTORY_EXHAUSTED` | Provider history was explicitly confirmed exhausted before reaching the target. |
| `INCOMPLETE` | Target not reached and history exhaustion was not confirmed, or a fetch failed. |
| `INVALID` | Malformed page, invalid candle, overlap, out-of-order pages, or interval gap/mismatch. |

`valid` is true only when the result is usable under the minimum-candle requirement. `HISTORY_EXHAUSTED` can therefore have `valid: false` when available history is below `minCandles`.

A fetch failure always produces `INCOMPLETE` unless a data-integrity violation already requires `INVALID`. It can never produce `COMPLETE`.

## Pagination cursor

`nextOlderEndTime(oldestOpenTime)` returns `oldestOpenTime - 1`, matching the existing backward-pagination boundary approach. It returns null at timestamp zero and throws for invalid timestamps.

The retrieval layer must still enforce cursor progress and page request limits. This helper does not perform requests or infer whether a short page means listing-history exhaustion.

## Important limits

- Use fixed `intervalMs` only for fixed-duration intervals (for example, 1h or 4h). Calendar interval `1M` needs a calendar-aware validator.
- The caller must supply pages in oldest-to-newest order.
- The helper validates page contents and the merged sequence, including cross-page boundaries.
- No production integration has been performed. Existing strategy algorithms and UI remain untouched.
