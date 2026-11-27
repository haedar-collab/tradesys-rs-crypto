# Tradesys RS Crypto — Baseline

**Baseline ref:** `45ec4be879d6497cb4472386adc1063a441e3b8e`  
**Branch:** `dev/cloudflare-modernization`  
**Baseline date:** 2026-11-27  
**Purpose:** Record the existing system before modernization. This document is descriptive; it does not authorize strategy or behavior changes.

## 1. Repository snapshot

At the baseline commit, the repository contains:

- `index.html` — approximately 544 KB; HTML, CSS, browser data adapter, analytics engine, and dashboard UI in one file.
- `README.md` — product description, deployment notes, features, and known limitations.

There is no package manifest, automated test suite, modular source tree, or checked-in test runner configuration at this baseline.

## 2. Runtime structure

The HTML currently has three inline script sections:

1. Browser persistence / compatibility adapter. It exposes `window.TEC_DB`, `window.TEC_WEB`, and a `window.claude.use(...)` compatibility shim.
2. Analytics engine. It is wrapped in an IIFE and exports `RadarEngine` in a browser, or `module.exports` in a CommonJS environment.
3. Dashboard application. It reads the engine through `window.RadarEngine` and handles UI, providers, scheduling, persistence, and notifications.

The engine is therefore separable for testing without changing the production HTML: the test harness can load the existing engine script in an isolated Node.js VM context.

## 3. Engine public API

The engine exports the following groups of functions and constants:

- Configuration / labels: `DEFAULTS`, `REGIME`, `PB_NAME`, `REG_LABEL`, `OPEN_STATUSES`, `PLAN_DEFAULTS`, `PLAN_OLD_DEFAULTS`.
- Indicators: `ind.ema`, `ind.sma`, `ind.rsi`, `ind.atr`, `ind.adx`, `ind.bbands`, `ind.obv`.
- Data preparation: `series`, `prepare`.
- Market / strategy analysis: `regimeTimeline`, `setupAt`, `smcAnalyze`, `techAnalysis`, `priceAction`, `weeklyContext`, `ltfTrigger`, `earlyCandidate`.
- Scan / backtest: `scan`, `backtest`, `backtestSignal`, `backtestCoin`, `coinTrades`, `poolStats`, `statsOf`, `btVerdict`.
- Signal / journal / risk: `signalRecord`, `signalText`, `planStatus`, `journalStats`, `closedR`, `journalDrawdown`, `edgeCheck`.
- Utilities: `fvol`, `eventRisk`, `normEvents`, `inHours`, `isStockToken`, `parseWatchlist`, `dayKey`, `fmtWIB`, `fmtUTC`, `fp`, `pct`.

This list is based on the exported `API` object in the baseline source. The test suite should flag unexpected API removal.

## 4. Existing strategy behavior to preserve

The following are characterization notes, not endorsements that the logic is correct:

- Spot long-only signal application; it produces analysis and alerts and does not place exchange orders.
- Market regime keys include `Uptrend`, `Sideways`, `Kompresi`, `Kapitulasi`, and `Downtrend`.
- Regime configuration selects playbooks and applies exposure / position limits.
- Relative strength is measured against BTC.
- SMC analysis uses 4H context and may use 1H data for a conditional trigger.
- Standard technical indicators include EMA, RSI, ATR, ADX, Bollinger Bands, and OBV.
- Signal output includes entry, stop, targets, risk / position sizing, validity, and explanatory reasons.
- The scan combines provider data, journal state, macro-event context, backtest information, and exposure constraints.
- The SMC zone-entry threshold is configured by `smcMidWidthPct` (baseline default 2.5).

## 5. Data and operational boundaries

- Market data is read from public Binance REST / WebSocket endpoints, with CoinGecko and an economic calendar feed also referenced by the application.
- Browser state is stored locally in the browser; this baseline does not provide server-side cross-device persistence.
- The README describes a GitHub Actions Telegram workflow named `regime-radar-satu-file.yml`. Its existence and operation must be independently verified before treating that statement as current operational capability.
- Telegram credentials are sensitive and must not be committed to source control or placed in client-side configuration during future backend work.
- A browser tab can be suspended or closed; in-page timers and WebSockets must not be treated as guaranteed background scheduling.

## 6. Known verification gaps

These items require tests or further source / runtime inspection:

1. OHLCV shape, numeric validity, ordering, duplicate timestamps, gaps, and candle closure are not comprehensively validated at the `series()` boundary.
2. Strategy-specific required timeframe coverage and stale-data behavior are not yet enforced by a documented centralized data gate.
3. The correlation helper aligns recent return arrays by index rather than joining by timestamp.
4. Unknown float / macro states need explicit fail-safe treatment where those filters are enabled.
5. Trading-plan halt / daily-limit behavior must be traced across signal creation, persistence, and every notification path.
6. Backtest intrabar ambiguity, limit-fill candle handling, fees, spread, and slippage assumptions need explicit characterization.
7. Existing backtest figures in README need reproducible fixtures / methodology before they are treated as validated performance claims.

These are audit findings to investigate. Do not silently change them as part of baseline creation.

## 7. Non-regression rules

- Preserve current formulas and default parameters unless a separately reviewed change explicitly authorizes an improvement.
- Every intentional behavior change must have a test demonstrating the old behavior, the new behavior, and the reason for the change.
- No look-ahead data may enter a historical signal decision.
- Do not compare backtest results produced with materially different samples or execution assumptions as if they were the same experiment.
- Unknown, stale, incomplete, or invalid critical data must not create an actionable BUY signal under the selected Strict / Fail-safe policy.
- The same safety decision must apply to every signal and entry-notification path.
- Keep this baseline commit and its outputs available for comparison.

## 8. Scope of this document

This baseline records what was inspected at the stated commit. It does not claim that the full application has been executed, that all integrations work, or that any live trading behavior is validated.
