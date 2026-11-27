# Automated Testing Strategy

## 1. Objective

Create a repeatable, dependency-light test foundation for Tradesys RS Crypto while preserving the existing single-file application and trading logic.

The initial test runner uses the Node.js built-in test framework. No third-party test dependency is required for this first stage.

## 2. Commands

Requirements: Node.js 18 or newer.

```bash
npm test
npm run test:watch
```

The tests load the existing analytics-engine IIFE from `index.html` in an isolated VM context. They do not load the dashboard DOM, make network requests, connect to Binance, or mutate browser storage.

## 3. Test layers

### Layer A — Characterization tests (first)

Capture current, deterministic behavior before refactoring:

- Public engine API presence.
- Indicator outputs on small fixed arrays.
- Closed-candle filtering in `series()`.
- Configuration defaults and regime mappings.
- Watchlist parsing and tokenized-stock classification.
- Signal-record serialization and journal R calculations.

These tests intentionally describe the current implementation. If a test reveals questionable behavior, record it as an audit finding; do not rewrite the test merely to make the implementation pass.

### Layer B — Strategy regression tests

Add deterministic OHLCV fixtures and expected outputs for:

- Regime classification and transition confirmation.
- Trend, mean-reversion, breakout, and panic setup rules.
- SMC zone detection, zone width, entry selection, BOS / CHoCH, FVG, order block, and liquidity sweep.
- Multi-timeframe trigger behavior.
- Entry, stop, TP, R:R, sizing, and exposure calculations.
- No-look-ahead behavior for pivots and historical evaluation.

Expected outputs must be derived from the baseline implementation and independently reviewed. Avoid hand-written expected values based on assumptions about intended strategy.

### Layer C — Data-quality and fail-safe tests

Test invalid / missing / stale inputs:

- NaN, Infinity, zero / negative prices, invalid OHLC relationships, and negative volume.
- Duplicate, unordered, missing, or misaligned timestamps.
- Open / incomplete candles and insufficient history.
- Missing required BTC Daily, coin Daily, or coin 4H data.
- Conditional 1H trigger data missing.
- Unknown float, macro, provider, and freshness states.

Acceptance: invalid or unknown critical data must never produce an actionable BUY under Strict / Fail-safe policy. The expected scope of blocking must remain strategy-specific; a coin-level failure must not automatically disable unrelated assets unless a global dependency (such as BTC Daily regime) is invalid.

### Layer D — Trading safety tests

Verify the centralized safety decision across:

- Manual scan and scheduled scan.
- Signal creation and persistence.
- Browser and Telegram entry notifications.
- Trading halt, cooldown, monthly loss limit, and daily trade limit.
- Position-management alerts, which should remain available when new entries are halted.

Acceptance: no entry alert is emitted for a blocked / information-only signal. Open-position risk alerts are not suppressed by an entry halt.

### Layer E — Backtest correctness tests

Keep separate result sets for:

1. Baseline reproduction.
2. Corrected execution assumptions.
3. Stress testing with higher fees / spread / slippage.

Test same-candle TP / SL ambiguity, limit-fill candle behavior, fee application, and look-ahead boundaries. Do not overwrite baseline results when adding corrected models.

### Layer F — Integration / operational tests

Later stages should cover provider adapters, Worker endpoints, D1 persistence, scheduled scans, backup / restore, idempotency, retries, logging, and secret handling.

## 4. Fixture policy

- Fixtures must be deterministic and committed as test data.
- Include source, timeframe, timezone, and generation method in fixture metadata.
- Synthetic fixtures are suitable for boundary tests, not proof of real-market profitability.
- Never use current live API responses as expected values in unit tests.
- Keep large historical datasets out of ordinary unit tests unless they are essential and licensed for repository storage.

## 5. Test naming and review

Use descriptive names that state the behavior being protected. Group tests by subsystem. A failing characterization test is a signal to investigate, not permission to alter the algorithm.

For any proposed algorithm change, require:
1. Baseline test / expected output.
2. Proposed output.
3. Explanation of intended improvement.
4. Backtest comparison on the same symbols, periods, and execution assumptions.
5. Explicit approval before changing production behavior.

## 6. Current limitations

The first test harness extracts the engine script from `index.html`. This avoids production refactoring but is intentionally temporary. Once engine extraction is separately approved, tests should import the modular engine directly and run the same regression suite against it.

This repository has not yet been executed in a Node.js runtime by the remote GitHub editor. The first local run in Codespaces is required to confirm the environment and resolve any harness issues.
