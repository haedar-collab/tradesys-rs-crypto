# Kline History Fetcher

## Purpose

`lib/kline-history-fetcher.cjs` is an injectable, network-independent orchestration helper for backward Binance Spot Kline pagination. It is separate from `index.html` and is not integrated into the production scan or backtest paths.

The caller supplies `fetchPage(params)`. The helper requests the newest page first, then requests older pages with `endTime = oldestOpenTime - 1`. It reverses the **page list** before merging so the merger receives oldest-to-newest pages. It never sorts candle rows.

## Example

```js
const { fetchHistoricalKlines } = require("./lib/kline-history-fetcher.cjs");

const result = await fetchHistoricalKlines({
  symbol: "BTCUSDT",
  interval: "4h",
  pageLimit: 1000,
  targetCandles: 4500,
  minCandles: 500,
  maxPages: 5,
  maxRetries: 1,
  intervalMs: 4 * 60 * 60 * 1000,
  fetchPage: params => provider.klines(params.symbol, params.interval, params.limit, params.endTime),
  // Return true only when the retrieval layer can confirm that older listing history is exhausted.
  isHistoryExhausted: async ({ page, pageLimit }) => page.length < pageLimit
});
```

The example's callback is a policy decision, not a universal Binance guarantee. If the application cannot reliably distinguish a genuinely short final response from an incomplete response, omit the callback. The helper will then return `INCOMPLETE` for a short or empty page before reaching the target.

## Options

| Option | Default | Meaning |
|---|---:|---|
| `fetchPage` | required | Injected async function receiving `symbol`, `interval`, `limit`, and optional `endTime`. |
| `symbol` | required | Binance Spot symbol. |
| `interval` | required | Binance interval string. |
| `pageLimit` | 1000 | Maximum expected response rows per page. |
| `targetCandles` | 4500 | Desired total candle count. |
| `minCandles` | 1 | Minimum usable count. |
| `maxPages` | 5 | Hard request-page cap. |
| `maxRetries` | 1 | Retries after the first failed request. |
| `now` | current time | Fixed evaluation timestamp used for every page. |
| `intervalMs` | null | Optional fixed interval duration. Do not use fixed milliseconds for calendar interval `1M`. |
| `isHistoryExhausted` | none | Async callback that must explicitly confirm listing-history exhaustion. |

## Fail-safe behavior

- A failed page request remains `INCOMPLETE`; successful earlier pages do not make it complete.
- A transient request error is retried only up to `maxRetries`.
- Short and empty pages do not automatically prove history exhaustion.
- The optional `isHistoryExhausted` callback must return exactly `true` to mark history exhausted.
- Page responses exceeding `pageLimit`, invalid candle rows, overlap, gaps, reversed page sequence, and cursor non-progress are rejected.
- The helper enforces `maxPages` and records request sizes, retry count, cursor history, stop reason, and fetch error.
- Source rows and page arrays are not mutated.
- If the target is reached on the final allowed page, the result may be `COMPLETE`; otherwise reaching the page cap before the target is `INCOMPLETE`.

## Result

The result retains the merger's `status`, `valid`, `rows`, `errors`, `warnings`, and `stats`, plus `pagination` metadata:

- `requestedCount`, `receivedCount`, `pageCount`, `pageSizes`
- `retryCount`, `maxRetries`, `maxPages`
- `cursorHistory`
- `historyExhausted`, `fetchFailed`, `fetchError`
- `stopReason`

## Limits and integration boundary

- This helper does not call Binance directly and has no dependency on browser APIs.
- It does not decide whether Binance's short response means listing history is exhausted; that determination belongs to a separately verified provider policy.
- Fixed-duration intervals can be validated with `intervalMs`. Calendar interval `1M` needs calendar-aware validation.
- No production integration has been performed. The existing backtest and strategy algorithms remain untouched.
