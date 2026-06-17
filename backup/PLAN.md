# ETF + US Stocks Signal App — Plan

## 1. Product Reset

This app is no longer a portfolio management tool.

It becomes a recommendation and research tool with two separate tracks:

- `ETF Weekly Advisor`: weekly ETF recommendations only
- `US Stock Tactical Screener`: short-term US stock signal research and screening

The product does not manage positions, trade sizes, cash balances, weights, or execution records.

---

## 2. Confirmed Scope

| Item | Decision |
| --- | --- |
| Portfolio / position management | Out of scope |
| Options flow | Out of scope |
| Options contracts, greeks, IV, chain analysis | Out of scope |
| ETF function | Weekly recommendation only |
| ETF historical mode | Replay recommendations over the last 6 months |
| US stock function | Tactical screening and signal research |
| US stock data | Free data sources only in early phases |
| Signal style | Explainable rule-based signals, not black-box scores |
| First frontend | Keep Vite + React + TypeScript |

---

## 3. Core Product Principle

The product is not a dashboard of holdings.

The product is a signal workspace that answers:

1. Which ETFs are favoured this week?
2. If I replay the same ETF rules over the last 6 months, what would they have recommended each week?
3. Which US stocks currently show strong or early tactical setups?
4. Which stock indicators are worth keeping after evidence review?

---

## 4. Explicit Non-Goals

The following are removed from the roadmap:

- holdings input
- position sizing
- average cost tracking
- cash reserve logic
- FX impact on account equity
- rebalance logic
- executed vs ignored journal
- broker import
- options flow ingestion
- option trade recommendation

If the app later returns to execution support, that should be a new product phase, not hidden inside this scope.

---

## 5. Product Structure

### 5.1 Track A: ETF Weekly Advisor

Purpose:

- Review a curated ETF universe once per week
- Produce recommendation labels for each ETF
- Replay those labels week by week over the last 6 months

### 5.2 Track B: US Stock Tactical Screener

Purpose:

- Screen a US stock universe or watchlist for short-term setups
- Use only free market data in early phases
- Start from hypothesis-driven indicators inspired by the attached stock screener
- Validate indicators before locking the final signal rules

---

## 6. Shared Design Rules

- Recommendations must be explainable in plain language.
- Every signal must show which indicators passed or failed.
- Every rule must be testable on historical data.
- Weekly ETF logic and tactical stock logic must remain separate engines.
- The app should prefer a small number of robust indicators over many opaque ones.
- Universe size must be driven by data source constraints, not the other way around.
- No signal is promoted to production until it passes the statistical gate in `BUY_SHORT_TIMING_RESEARCH.md` Section 10.

---

## 7. ETF Weekly Advisor

### 7.1 Objective

For each ETF in the curated universe, classify the current weekly stance as one of:

- `FAVOUR`
- `WATCH`
- `WAIT`
- `AVOID`
- `REVIEW`

These are recommendation labels, not trade instructions.

### 7.2 ETF Review Frequency

- Run the recommendation process on weekly data.
- Default review anchor: latest completed trading week.
- Use daily data as the raw source, then aggregate or derive weekly features.

### 7.3 ETF Universe Governance

The ETF universe remains manually curated and low-frequency.

- Universe review cadence: monthly
- Recommendation cadence: weekly
- ETF list changes should not be driven by short-term market noise
- Target size: 20–30 ETFs (manageable within free API limits)

The existing `src/data/etfUniverse.ts` concept still fits this requirement.

### 7.4 ETF Data Inputs

Required per ticker:

- symbol
- name
- category
- currency
- daily OHLCV history
- weekly close series derived from daily data

Required benchmark or regime series:

- `SPY` or `VOO`
- `QQQ`
- `2800.HK` for HK trend context
- `GLD`
- `^VIX`

### 7.5 ETF Indicators

Phase 1 indicator set should stay simple. All indicators computed locally from raw OHLCV — no remote indicator API calls.

- `13-week return`
- `26-week return`
- `price vs 10-week moving average`
- `price vs 40-week moving average`
- `relative strength vs SPY` or category benchmark
- `VIX risk regime`

Optional later:

- `max drawdown over 26 weeks`
- `trend slope of 10-week MA`
- `breadth proxy` for broad market ETFs

### 7.6 ETF Recommendation Rules

Initial working rules:

- `FAVOUR`
  - price above 10W MA
  - 10W MA above 40W MA or rising
  - 13W return positive
  - not blocked by regime rule
- `WATCH`
  - trend improving but not fully confirmed
  - mixed momentum across 13W and 26W
- `WAIT`
  - structurally acceptable ETF but regime is unfriendly
  - example: equity ETF trend is fine but `^VIX` is elevated
- `AVOID`
  - price below 40W MA and momentum weak
  - repeated underperformance vs benchmark
- `REVIEW`
  - missing or stale data (more than 2 trading days old)
  - insufficient history (fewer than 40 weeks)
  - abnormal indicator conflict

### 7.7 ETF Regime Rules

Regime is only a recommendation filter, not an allocation engine.

Suggested first-pass rules:

- If `^VIX > 25`, downgrade risk-on equity ETFs by one level
- If `SPY` is below 40W MA, suppress aggressive growth ETF recommendations
- If `2800.HK` is below 40W MA, downgrade HK / China ETF recommendations
- If `GLD` is above 40W MA while equity regime is weak, allow gold to remain `FAVOUR` or `WATCH`

### 7.8 ETF Historical Replay

The app must support a 6-month replay mode.

Definition:

- Look back roughly 26 completed weeks
- For each week, recompute the recommendation using only data available up to that week (no look-ahead)
- Store weekly output snapshots for comparison

Look-ahead bias prevention:

- For `week_ending_date = W`, only use data with `close_date <= W`
- Moving average lookback must not exceed the available history at that week
- Forward return is computed from the next week's open, not the signal week's close
- Survivorship bias: only include tickers that were in the universe at that point in time

Replay output should show:

- week ending date
- per-ETF recommendation label
- key indicators behind the label
- next 1-week return
- next 4-week return

This is not a trading backtest with capital curves. It is a recommendation replay and evidence layer.

### 7.9 ETF Success Metrics

Use evidence, not opinion:

- share of weeks where `FAVOUR` outperformed `AVOID`
- average next 1-week return by label
- average next 4-week return by label
- hit rate of `FAVOUR` vs benchmark
- max drawdown during `FAVOUR` periods
- count of `REVIEW` weeks caused by bad data

---

## 8. US Stock Tactical Screener

### 8.1 Objective

The US stock side is a tactical screener for short-horizon ideas, not a portfolio engine.

Signal labels use a three-tier ladder plus transition and review labels:

**Long signals:**

- `LONG_WATCH` — early reversal sign, needs further confirmation
- `LONG_SETUP` — conditions forming, not yet fully confirmed
- `LONG_CONFIRM` — strong confirmation, all conditions met
- `UP_PROMOTION` — yesterday `LONG_SETUP`, today `LONG_CONFIRM`; highest signal quality

**Short signals:**

- `SHORT_WATCH` — early weakening, exit warning for existing longs
- `SHORT_SETUP` — conditions forming, needs human review before acting
- `SHORT_CONFIRM` — strong breakdown confirmation, still subject to event filter
- `DOWN_PROMOTION` — yesterday `SHORT_SETUP`, today `SHORT_CONFIRM`

**Non-directional:**

- `NEUTRAL` — mixed or conflicting indicators
- `AVOID_CHOP` — price crossing EMA repeatedly, no trend
- `REVIEW_DATA` — missing, stale, or insufficient data
- `REVIEW_EVENT` — earnings within 3 trading days or extreme gap

The mapping from OptionFlow screener labels:

| OptionFlow Label | This App Label |
| --- | --- |
| Strong UP | `LONG_CONFIRM` |
| Early UP | `LONG_WATCH` / `LONG_SETUP` |
| Strong DOWN | `SHORT_CONFIRM` |
| Early DOWN | `SHORT_WATCH` / `SHORT_SETUP` |
| Promoted | `UP_PROMOTION` / `DOWN_PROMOTION` |
| Neutral | `NEUTRAL` |
| (new) | `AVOID_CHOP` |
| (new) | `REVIEW_DATA` / `REVIEW_EVENT` |

### 8.2 Current Constraint

Options data is excluded. Therefore the app cannot directly copy:

- option flow
- smart money derived from options positioning
- greeks / IV logic

Instead, we use free price-volume proxies and validate whether they are good enough. See `BUY_SHORT_TIMING_RESEARCH.md` for the full indicator framework.

### 8.3 US Stock Universe

Start with two layers:

- `Core universe`: 50 liquid names (S&P 500 subset or manually curated). Upper bound is driven by data source limits — see Section 10.
- `Watchlist overlay`: user-maintained tickers, 10–20 names, always screened

Do not start from the entire US market. Keep the first screening universe small enough to inspect manually and within free API quotas.

### 8.4 US Stock Data Inputs

Required:

- daily OHLCV (previous 12 months minimum for indicator lookback)
- benchmark series: `SPY`, `QQQ`, `IWM`
- `^VIX`
- earnings dates from free source (Finnhub)

Useful but optional:

- sector / industry tag
- average daily dollar volume (for liquidity filter)

Intraday (4H) data: deferred to Phase C after daily research proves baseline edge. Do not invest in intraday data infrastructure before that gate.

### 8.5 Indicator Framework

All indicators computed locally from raw OHLCV. No remote indicator API calls.

**Trend structure:**

- `EMA(20)`, `EMA(50)`
- `price vs EMA(20)`, `price vs EMA(50)`
- `EMA(20) slope` (5-bar)
- `breakout above 20-day high`
- `breakdown below 20-day low`

**Momentum:**

- `RSI(14)`
- `MACD histogram`
- `relative strength vs SPY` (20-day rolling)

**Volume / flow proxies:**

- `RVOL` (vs 20-day average volume)
- `CMF(20)`
- `OBV slope` (10-bar regression)
- `CLV` (close location value)

**Regime filters:**

- `SPY EMA(50)` trend
- `QQQ EMA(50)` trend
- `^VIX` level

**Event filters:**

- earnings within N days
- extreme gap (> 3 ATR)
- missing or thin-volume symbols

Full calculation formulas are in `BUY_SHORT_TIMING_RESEARCH.md` Section 4.

### 8.6 Timeframe Model

Phase 1 (daily only):

- `1D` as primary decision timeframe
- `1W` as context and regime only

Phase 3 and beyond (if daily research proves edge):

- `4H` as early trigger
- `1D` remains main decision timeframe
- `1W` remains context only

### 8.7 Signal Classification Logic

This is a research hypothesis, not the final production rule. Full thresholds are in `BUY_SHORT_TIMING_RESEARCH.md` Section 5.

Summary:

- `LONG_WATCH`: RSI crosses above 50, MACD histogram turns positive, CMF turns positive. V-shape detection.
- `LONG_SETUP`: close > EMA(20), EMA(20) slope positive, RSI > 55, RVOL > 1.2, CMF > 0, regime not hostile.
- `LONG_CONFIRM`: breakout above 20D high, RVOL > 1.5, CMF > 0.05, CLV > 0.65, EMA(20) > EMA(50), regime long-friendly, no earnings within 5 days.
- `UP_PROMOTION`: previous day `LONG_SETUP`, today `LONG_CONFIRM`.
- `SHORT_WATCH`: close loses EMA(20), RSI crosses below 50, relative strength vs SPY weakening.
- `SHORT_SETUP`: close < EMA(20), EMA(20) slope negative, RSI < 45, CMF < 0, regime not long-friendly.
- `SHORT_CONFIRM`: breakdown below 20D low, RVOL > 1.5, CMF < -0.05, CLV < 0.35, EMA(20) < EMA(50), regime short-friendly, no earnings within 5 days.
- `DOWN_PROMOTION`: previous day `SHORT_SETUP`, today `SHORT_CONFIRM`.
- `AVOID_CHOP`: price crosses EMA(20) more than twice in 5 days, RSI 45–55, low RVOL.
- `REVIEW_DATA`: missing OHLCV, stale data, insufficient lookback.
- `REVIEW_EVENT`: earnings within 3 trading days, extreme gap event.

Label priority when conflicts arise:

```text
REVIEW_DATA > REVIEW_EVENT > AVOID_CHOP > directional labels
LONG_CONFIRM > LONG_SETUP > LONG_WATCH
SHORT_CONFIRM > SHORT_SETUP > SHORT_WATCH
UP_PROMOTION and DOWN_PROMOTION are additive labels, not replacements
```

---

## 9. US Stock Indicator Research Plan

### 9.1 Research Goal

Decide which free-data indicators are actually useful for tactical stock screening. No indicator enters production until it passes the statistical gate.

### 9.2 Research Dataset Fields

For each stock on each review date, store:

```text
signal_date, ticker, signal_class
close_at_signal
ret_1d, ret_3d, ret_5d, ret_10d
ret_5d_vs_spy, ret_10d_vs_spy
mfe_5d, mfe_10d
mae_5d, mae_10d
earnings_in_window
regime_at_signal
rvol_at_signal, atr_at_signal
```

### 9.3 Research Questions

- Does `RVOL + RSI + trend` identify better setups than trend alone?
- Does adding `CMF` or `OBV` improve signal quality?
- Is `4H` worth the data complexity, or is `1D + 1W` enough?
- Do `UP_PROMOTION` signals have materially better forward returns than ordinary `LONG_CONFIRM`?
- Which indicator combinations produce too many false positives?
- Should `EARLY` / `WATCH` signals exist at all, or only `CONFIRM` signals?
- Does the regime filter reduce false positives significantly?

### 9.4 Statistical Acceptance Gate

An indicator is accepted into v1 production rules only when it passes all gates defined in `BUY_SHORT_TIMING_RESEARCH.md` Section 10:

- Sample size ≥ 100 instances
- Mean 5D return directionally correct
- Mean 5D return exceeds SPY mean + 0.5%
- Consistent direction in both halves of the sample
- Positive mean return in neutral regime (not only in long-friendly)
- Mean MAE (5D) below 3%

### 9.5 Research Deliverables

- indicator definition sheet with calculation formulas
- signal replay dataset
- hit-rate summary by signal class
- regime-split return table
- recommendation: which indicators to keep, remove, or demote to optional

### 9.6 Decision Gate

Do not lock the tactical screener rules until the evidence review is done.

---

## 10. Data Strategy

### 10.1 API Limit Reality

Free data sources have hard constraints that drive universe sizing. Do not design around imagined unlimited access.

| Source | Free Limit | History | Primary Use |
| --- | --- | --- | --- |
| Alpha Vantage | 25 calls/day | 20+ years | Fallback OHLCV only |
| Polygon.io free | 5 calls/min, unlimited/day | 2 years | Primary US stock OHLCV |
| Finnhub | 60 calls/min | limited | Earnings calendar |
| Yahoo Finance (yfinance) | Unofficial, unstable | Multi-year | Research / prototype only |
| Stooq | CSV download, no API | Multi-year | Historical batch download |

**Critical constraint:**

If using Alpha Vantage as primary, 25 calls/day means universe ≤ 21 stocks (after reserving 4 calls for benchmarks). With Polygon.io, the practical limit is 50–100 stocks per daily batch at 5 calls/min.

**Strategy:**

- Research phase: yfinance for speed
- Production: Polygon.io free tier as primary, Alpha Vantage as fallback
- Earnings: Finnhub
- All indicators: computed locally from raw OHLCV — never use remote indicator endpoints

### 10.2 Universe Size Constraints

```text
ETF universe:         20–30 tickers
Stock core universe:  50 tickers (hard ceiling at Phase 1)
Stock watchlist:      10–20 tickers (user-defined)
Benchmark series:     SPY, QQQ, IWM, VIX (4 tickers, daily must-fetch)
```

Universe expansion beyond 50 stocks requires either a paid data source or a rotating fetch schedule (update 30% of tickers per day, use cached data for the rest).

### 10.3 Local Cache Requirements

Cache is a first-class design constraint, not an optimisation.

```text
Cache structure:
  data/cache/{ticker}/daily/{YYYY-MM-DD}.json
  data/cache/earnings/{ticker}.json
  data/cache/benchmark/{ticker}/daily/{YYYY-MM-DD}.json

Cache rules:
  Read cache first, call API only on cache miss
  Daily OHLCV: update once after market close, never expire
  Earnings: refresh weekly
  Stale check: if newest cache date is more than 2 trading days old, output REVIEW_DATA
```

### 10.4 Data Health Rules

Every engine must expose:

- missing data
- stale data
- derived timeframe availability
- source used

Any unresolved data problem produces `REVIEW_DATA`, not a false-confidence signal.

---

## 11. Application Information Architecture

### 11.1 ETF Weekly

- current week recommendation table
- regime summary
- indicator breakdown per ETF
- filter by category / market

### 11.2 ETF Replay

- last 26 weeks of recommendation snapshots
- label distribution over time
- next-week and next-4-week outcome table per label

### 11.3 Stock Screener

- current signal classes (all 12 labels)
- watchlist overlay
- filter by class
- per-stock indicator breakdown showing which conditions passed or failed

### 11.4 Stock Research

- forward return summary by signal class
- regime-split return table
- MAE / MFE distribution
- indicator gate status (passed / experimental / rejected)
- `UP_PROMOTION` vs ordinary `LONG_CONFIRM` comparison

### 11.5 Data Health

- last refresh time per ticker
- source used per ticker
- stale or missing tickers
- API call count remaining (if trackable)

---

## 12. Engine Architecture

Keep the provider and normalization separation already established in the repo.

```text
src/
  engine/
    etfWeeklyEngine.ts
    etfReplayEngine.ts
    stockScreenerEngine.ts
    stockResearchEngine.ts
    marketRegime.ts
    signalClassifier.ts
    indicatorEngine.ts        (all local indicator calculations)
  data/
    etfUniverse.ts
    stockUniverse.ts
    watchlist.ts
  services/
    marketData/
      PriceProvider.ts
      HistoryProvider.ts
      earningsProvider.ts
      normalizeMarketData.ts
      marketDataCache.ts      (local cache layer, first-class)
  types/
    etf.ts
    stock.ts
    signal.ts                 (includes all 12 signal label types)
    indicator.ts
    market.ts
    replay.ts
    research.ts
```

`indicatorEngine.ts` computes all technical indicators (EMA, RSI, MACD, CMF, OBV, RVOL, CLV, ATR) from raw OHLCV locally. No remote indicator API calls anywhere in the codebase.

---

## 13. Development Phases

### Phase 0: Scope Reset and Spec Rewrite

- Remove portfolio-management concepts from the plan
- Define new signal labels (12-label system)
- Define two-engine architecture
- Define replay and research outputs
- Confirm data strategy and universe size limits

Exit criteria:

- No remaining dependency on holdings, weights, or cash
- Options explicitly out of scope everywhere
- Signal label taxonomy matches `BUY_SHORT_TIMING_RESEARCH.md`

### Phase 1: Data Source Validation

- Confirm ETF free data path
- Evaluate free US stock data options (Polygon.io vs yfinance)
- Test daily history coverage for 50-stock universe + 4 benchmarks
- Confirm Finnhub earnings calendar integration
- Document rate limits, gaps, and caching strategy
- Confirm local cache layer works correctly

Exit criteria:

- Chosen data path is documented with known limits
- Cache layer stores and retrieves daily OHLCV correctly
- Earnings calendar returns correct dates for test set

### Phase 2: Local Indicator Engine

- Implement all indicators locally from OHLCV: EMA, RSI, MACD, CMF, OBV slope, RVOL, CLV, ATR
- Write unit tests for each calculation against known reference values
- Validate ETF indicator outputs with manual sanity check (5–10 ETFs, compare to charting tool)

Exit criteria:

- Indicator outputs match reference values within tolerance
- No remote indicator API calls exist in the codebase

### Phase 3: ETF Weekly Engine

- Implement ETF weekly recommendation labels
- Implement regime downgrade rules
- Implement `REVIEW` output for data quality issues

Exit criteria:

- Every ETF can be classified for the latest completed week
- Every label is explainable from indicator values
- VIX and SPY regime rules correctly downgrade labels

### Phase 4: ETF Replay Engine

- Generate rolling weekly snapshots for the last 26 weeks
- Enforce look-ahead bias prevention rules (data cutoff per week, survivorship control)
- Compute label outcome tables (next 1W and 4W return)

Exit criteria:

- User can inspect historical recommendations week by week
- No look-ahead bias: each week's output uses only data available at that week
- Outcome table shows return by label with sample counts

### Phase 5: US Stock Research Engine

- Ingest free stock history for core universe (50 stocks)
- Calculate all candidate indicators via local indicator engine
- Generate provisional signal classes using hypothesis rules from `BUY_SHORT_TIMING_RESEARCH.md`
- Store forward-return research dataset (all fields in Section 9.2)

Exit criteria:

- Research dataset exists for at least 3 months of history
- Candidate indicators can be compared empirically
- Forward return fields are computed without look-ahead

### Phase 6: Research Review and Rule Lock

- Evaluate each indicator against the statistical gate (Section 9.4)
- Remove or demote indicators that fail
- Compare `UP_PROMOTION` vs ordinary `LONG_CONFIRM` forward returns
- Freeze v1 tactical stock classification rules

Exit criteria:

- All production signal rules have passed the statistical gate
- Experimental indicators are marked `EXPERIMENTAL` in the UI
- Final v1 rule set is simpler than the research candidate set

### Phase 7: US Stock Screener UI

- Current stock screen with all 12 signal classes
- Watchlist overlay
- Class filters
- Per-stock indicator breakdown (showing which conditions passed or failed)

Exit criteria:

- User can scan current setups quickly
- User can understand why a stock is in any given class
- `REVIEW_DATA` and `REVIEW_EVENT` are visible, not hidden

### Phase 8: Research Review UI

- Forward return summary by signal class
- Regime-split return table
- MAE / MFE distribution charts
- `UP_PROMOTION` vs ordinary `LONG_CONFIRM` comparison panel

---

## 14. Test Matrix

### ETF Weekly

| Scenario | Expected Result |
| --- | --- |
| ETF above 10W and 40W MA, positive 13W return | `FAVOUR` |
| ETF above 10W MA but weak 26W momentum | `WATCH` |
| Equity ETF trend fine but `^VIX > 25` | downgrade to `WAIT` or `WATCH` |
| ETF below 40W MA with weak benchmark-relative strength | `AVOID` |
| Missing weekly history | `REVIEW` |

### US Stocks — Signal Classification

| Scenario | Expected Result |
| --- | --- |
| RSI crosses above 50, MACD histogram turns positive, CMF turns positive | `LONG_WATCH` |
| close > EMA(20), EMA(20) slope positive, RSI > 55, RVOL > 1.2 | `LONG_SETUP` |
| breakout above 20D high, RVOL > 1.5, CMF > 0.05, CLV > 0.65, regime long-friendly | `LONG_CONFIRM` |
| previous day `LONG_SETUP`, today `LONG_CONFIRM` | `UP_PROMOTION` + `LONG_CONFIRM` |
| close loses EMA(20), RSI crosses below 50 | `SHORT_WATCH` |
| close < EMA(20), RSI < 45, CMF < 0 | `SHORT_SETUP` |
| breakdown below 20D low, RVOL > 1.5, CMF < -0.05, regime short-friendly | `SHORT_CONFIRM` |
| indicator conflict (RSI high, CMF negative) | `NEUTRAL` |
| price crosses EMA(20) 3 times in 5 days, RSI 45–55 | `AVOID_CHOP` |
| earnings in 3 days | `REVIEW_EVENT` |
| stale or missing OHLCV | `REVIEW_DATA` |

### Look-ahead Bias

| Scenario | Expected Result |
| --- | --- |
| Replay week W uses data from W+1 | Test fails (data cutoff enforced) |
| EMA computed with only 10 bars of history | `REVIEW_DATA` (insufficient lookback) |
| Forward return starts from signal_date close | Test fails (must start from next day) |

---

## 15. Success Criteria

The app is useful only if it can answer these quickly:

1. Which ETFs look strongest this week?
2. How would these ETF rules have behaved over the last 6 months?
3. Which US stocks deserve attention right now?
4. Which tactical indicators actually earned their place?
5. Which signals are trustworthy, and which are provisional or data-limited?

---

## 16. Immediate Next Build Tasks

1. Confirm data pipeline: choose between Polygon.io and yfinance, validate coverage for 50-stock core universe.
2. Build local indicator engine (`indicatorEngine.ts`) and write unit tests.
3. Build the ETF weekly classifier using the indicator engine.
4. Build the 6-month ETF replay with look-ahead bias prevention.
5. Run the US stock free-data collection and research engine before finalising screener rules.
6. Review indicator gate results before any production rule is locked.

---

## 17. Disclaimer

This app is for market observation, recommendation research, and rule evaluation only. It does not manage a live portfolio, execute trades, size positions, provide options analysis, or provide financial advice. Historical replay is not proof of future performance.
