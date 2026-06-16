# Global ETF Command Centre - Implementation Plan

## 1. Product Goal

Build a personal ETF portfolio command centre that helps with weekly review:

- Monitor ETF holdings in HKD base currency.
- Compare actual year-to-date performance against a 10% annual target.
- Generate clear weekly actions: `ADD`, `HOLD`, `WAIT`, `TRIM`, `REDUCE`, or `REVIEW`.
- Record executed or ignored decisions in a local journal.
- Start with real end-of-day price data, with mock data used only for tests and fallback.

This project is a decision-support tool, not an automated trading system.

## 2. Confirmed Scope

| Item | Decision |
| --- | --- |
| Base currency | HKD |
| Broker | Broker-agnostic in Phase 1 |
| Review frequency | Weekly |
| Annual target | 10% |
| Phase 1 data | Yahoo Finance EOD prices via Vite proxy + manual holdings input |
| Cash handling | Track explicit HKD cash balance as part of portfolio value and deployment plan |
| First persistence layer | `localStorage` plus JSON/CSV export |
| First frontend stack | Vite + React + TypeScript |

## 3. Core Product Principle

The dashboard is not the product. The `Signal Engine` is the product.

The UI should only make the engine output easy to understand:

- `Action Centre`: what should I do this week?
- `Portfolio Monitor`: what do I own now?
- `Signal Feed`: why did the engine produce each signal?
- `ETF Universe`: what instruments are available?
- `Journal`: what did I actually decide?

## 4. Phase 0: Specification Before UI

Before building the interface, define the engine contract and test cases.

### 4.1 Required Decisions

- Define how YTD return is calculated.
- Define how deposits, withdrawals, dividends, and FX are handled in Phase 1.
- Define rule precedence when signals conflict.
- Define target allocation presets.
- Define test portfolios that should produce predictable signals.

### 4.2 Phase 1 Return Formula

Phase 1 should use a simple, transparent approximation:

```typescript
portfolioReturn =
  (currentPortfolioValueHkd - startingPortfolioValueHkd - netContributionHkd)
  / startingPortfolioValueHkd
```

Definitions:

- `startingPortfolioValueHkd`: portfolio value at start of year or first app setup.
- `currentPortfolioValueHkd`: calculated from holdings, fetched prices, and FX rate.
- `netContributionHkd`: deposits minus withdrawals.
- Dividends are included only if manually entered as cash or reinvested value.
- FX rate is fetched automatically when available, with manual override if the fetch fails or the user wants to lock a rate.

**FX lock-in rule**: `startingPortfolioValueHkd` is a one-time user input captured at first setup. It must not be recalculated with the current FX rate. Recalculating it would introduce USD/HKD movement into the YTD return figure and make it impossible to separate ETF performance from currency effects. To isolate ETF performance from FX movement, Portfolio Monitor should display both the raw USD return per US ETF and the HKD-converted return separately.

This is not a perfect time-weighted return, but it is understandable and good enough for Phase 1.

### 4.3 Target Tracking

```typescript
proRatedTarget = annualTarget * elapsedYearRatio
targetGap = actualYtdReturn - proRatedTarget
```

Example:

- Annual target: `10%`
- Month: June
- Pro-rated target: `5%`
- Actual YTD: `4.2%`
- Gap: `-0.8%`
- Status: `slightly behind`

### 4.4 Return Status

| Status | Condition | Engine Behaviour |
| --- | --- | --- |
| `AHEAD` | `targetGap > +2%` | Consider harvesting risk, but only if overweight or high-risk exposure exists |
| `ON_TRACK` | `targetGap between -2% and +2%` | Normal rebalance logic |
| `BEHIND` | `targetGap between -5% and -2%` | Run attribution review before adding risk |
| `FAR_BEHIND` | `targetGap < -5%` | Trigger strategy review, not automatic growth buying |

Important: being behind target should not automatically mean buying more high-risk assets. The engine must first check whether the gap is caused by allocation drift, market weakness, cash drag, FX movement, or missing data.

## 5. Signal Engine Architecture

```text
inputs
  current holdings
  target allocation
  return tracker
  market regime
  ETF universe
  real EOD price data
  FX data
  user settings

engine modules
  returnTracker
  rebalance
  marketRegime
  scoring
  riskGuards
  signalResolver

outputs
  final action list
  full signal feed
  blocked/suppressed signals
  portfolio health summary
```

### 5.1 Signal Types

| Signal | Meaning |
| --- | --- |
| `ADD` | Increase position toward target allocation |
| `HOLD` | No action needed |
| `WAIT` | Desired action is blocked by market regime or weak score |
| `WATCH` | No action yet, but condition is close to threshold |
| `TRIM` | Reduce part of an overweight or high-risk position |
| `REDUCE` | Reduce position because risk or allocation breach is material |
| `REVIEW` | Human decision required before action |

### 5.2 Signal Fields

```typescript
type Signal = {
  id: string
  ticker: string
  action: SignalAction
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  reason: string
  ruleId: string
  category: ETFCategory
  currentWeight: number
  targetWeight: number
  weightGap: number
  suggestedAmountHkd?: number
  suggestedPostTradeWeight?: number
  blockedBy?: string[]
  createdAt: string
}
```

For a HKD 1M mandate, signals should also respect portfolio policy:

- Minimum trade size to avoid tiny rebalances.
- Cash reserve target so the engine does not fully deploy dry powder.
- Maximum single ETF concentration limit.
- Maximum first-tranche size for new positions.

### 5.3 Rule Precedence

When multiple rules conflict, resolve them in this order:

1. Hard risk guard
2. Portfolio concentration rule
3. Market regime suppression
4. Return status adjustment
5. Rebalance signal
6. ETF opportunity score
7. Display priority sort

Example:

- QQQ is underweight, so rebalance suggests `ADD`.
- VIX is above 25, so regime blocks equity adds.
- Final output becomes `WAIT QQQ`, with `blockedBy: ['RISK_OFF_REGIME']`.

## 6. Engine Rules

### 6.1 Rebalance Rules

| Condition | Raw Signal |
| --- | --- |
| `weight > target + 5%` | `REDUCE` |
| `weight < target - 5%` | `ADD` |
| `weight within +/-2%` | `HOLD` |
| `weight gap between 2% and 5%` | `WATCH` |

### 6.2 Return-Based Rules

| Condition | Signal |
| --- | --- |
| `YTD > proRatedTarget + 2%` | Check whether high-risk assets are overweight |
| `YTD > 9%` | `HARVEST_REVIEW` before adding more risk |
| `YTD < proRatedTarget - 5%` | `REVIEW`, not automatic buying |
| `position P/L < -15%` | `REVIEW` |

### 6.3 Market Regime Rules

| Condition | Effect |
| --- | --- |
| `VIX > 25` | Suppress equity, sector, HK/China, and high-yield `ADD` signals |
| `S&P 500 below 200MA` | Add caution flag to VOO/QQQ adds |
| `credit spread widening` | Suppress HYG/JNK adds |
| `HK trend weak` | Suppress HK/China adds |
| `gold trend positive and equity weak` | Allow gold add even in defensive regime |
| `inflation rising` | Allow gold, broad commodities, and energy exposure if enabled in preset |

**Regime indicator sources**: Some indicators are auto-derived from price data already being fetched. Others require manual input in Phase 1.

| Indicator | Source | Method |
| --- | --- | --- |
| VIX level | Yahoo Finance `^VIX` | Auto-fetch (add to ticker list) |
| S&P 500 vs 200MA | VOO or SPY price history | Auto-derived from existing fetch |
| HK market trend | 2800.HK price vs 200MA | Auto-derived from existing fetch |
| Gold trend | GLD or 2840.HK price vs 200MA | Auto-derived from existing fetch |
| Credit spread | No free real-time source | Manual input; Phase 5 via FRED `BAMLH0A0HYM2` |
| Inflation expectation | No free real-time source | Manual input; Phase 5 via FRED `T5YIE` |

The `marketRegime.ts` module accepts a `RegimeInputs` object that mixes auto-derived values and manual overrides. The UI must clearly label each indicator as `AUTO` or `MANUAL` so the user knows what the engine is acting on.

### 6.4 Risk Protection Rules

| Condition | Signal |
| --- | --- |
| `portfolio drawdown > 8%` | `REDUCE_RISK_REVIEW` |
| `single ETF > 30%` | `CONCENTRATION_REVIEW` |
| `cash/treasury below minimum buffer` | `BUFFER_REVIEW` |
| `unknown ticker or missing price` | `DATA_REVIEW` |

## 7. Scoring Model

Do not merge rebalancing and market timing into one opaque score.

Use two separate outputs:

### 7.1 Rebalance Score

Measures whether the holding is far from target allocation.

| Factor | Weight |
| --- | --- |
| Allocation gap | 70% |
| Position size impact | 30% |

### 7.2 Opportunity Score

Measures whether now is a reasonable time to add.

| Factor | Weight |
| --- | --- |
| 3M / 6M momentum | 40% |
| Price above moving average | 25% |
| Macro/regime fit | 35% |

### 7.3 Final Decision Logic

```typescript
if (riskGuardTriggered) return REVIEW
if (rebalanceSignal === 'ADD' && opportunityScore < 45) return WAIT
if (rebalanceSignal === 'ADD' && regimeBlocksAdd) return WAIT
if (rebalanceSignal === 'ADD') return ADD
if (rebalanceSignal === 'REDUCE') return REDUCE
return HOLD
```

## 8. ETF Universe

### 8.1 Required Core Categories

Every preset should include target weights for:

- `US_TREASURY`: SGOV, SHY, IEF, BND, AGG, LQD
- `US_EQUITY_CORE`: VOO, VTI, QQQ, QQQM

### 8.2 Optional Satellite Categories

Satellite categories can be enabled or disabled by preset:

- `HY_BOND`: HYG, JNK
- `INTL_EQUITY`: VXUS, EFA, EEM, IEMG, ACWI
- `HK_CHINA`: 2800.HK, 3067.HK, 3033.HK, 2828.HK, 3188.HK
- `GOLD`: GLD, IAU, 2840.HK
- `COMMODITY`: PDBC, DBC
- `REIT`: VNQ
- `SECTOR`: SMH, XLV, XLE
- `DIVIDEND`: SCHD, VIG

### 8.3 ETF Data Shape

Two separate types. Static definition lives in `data/etfUniverse.ts`. Price data is fetched at runtime and never stored in the ETF definition.

```typescript
// Static — defined once in data/etfUniverse.ts
type ETF = {
  ticker: string
  name: string
  category: ETFCategory
  currency: 'USD' | 'HKD'
  assetClass: string
  region: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  enabledInPresets: string[]
}

// Dynamic — populated by YahooFinancePriceProvider at runtime
type ETFPriceData = {
  ticker: string
  currentPrice: number
  previousClose: number
  movingAverage50: number
  movingAverage200: number
  oneMonthReturn: number
  threeMonthReturn: number
  sixMonthReturn: number
  oneYearReturn: number
  fetchedAt: string       // ISO timestamp
  isStale: boolean        // true if age > TTL or last fetch failed
}

// Merged type used by Signal Engine at runtime
type ETFWithPrice = ETF & {
  priceData: ETFPriceData | null   // null triggers DATA_REVIEW signal
}
```

The Signal Engine always operates on `ETFWithPrice`. If `priceData` is null or `isStale` is true, the engine emits `DATA_REVIEW` instead of any buy or sell signal for that ticker.

### 8.4 ETF Universe Governance

The ETF universe is curated manually. It is not an auto-discovered list and it is not refreshed by the app on a schedule.

#### Inclusion Criteria

An ETF should be added only if it meets most of these conditions:

- It has a clear portfolio role: core growth, treasury defense, yield, gold hedge, regional exposure, or satellite theme.
- It fits one of the supported `ETFCategory` values already used by the engine.
- It has stable ticker support in the current market data layer.
- It is liquid and mainstream enough for a personal weekly review workflow.
- It is not a redundant duplicate of an existing ETF unless there is a strong currency, cost, or market-access reason.
- It can be mapped cleanly into one or more presets through `enabledInPresets`.

#### Removal Criteria

An ETF should be reviewed for removal if:

- Its ticker no longer resolves reliably in the data layer.
- It has become too illiquid, niche, or structurally risky for this project.
- It overlaps too heavily with another ETF already in the universe and no longer adds decision value.
- It no longer matches any preset role or regime rule used by the engine.

#### Review Cadence

- Review the ETF universe once per month.
- This review is manual, not automated.
- Monthly review should check ticker validity, data-source reliability, role clarity, overlap, and whether preset coverage still makes sense.
- Changes to the universe should be intentional and low-frequency. Avoid changing the list simply because of short-term market noise.

#### Operational Rule

- The app may use real prices daily, but the ETF universe list itself is governed monthly.
- Adding or removing an ETF should also trigger a quick review of affected presets, target weights, and market regime rules.

## 9. Portfolio Presets

Start with three presets. Exact weights can be adjusted later, but each preset must sum to 100%.

| Preset | Purpose |
| --- | --- |
| `Defensive` | Lower volatility, more treasury and cash-like exposure |
| `Balanced` | Default weekly review preset |
| `Growth` | Higher equity and technology exposure |

The engine should always validate:

- total target weight equals `100%`
- no single ETF target exceeds `30%`
- required core categories are present
- disabled categories cannot generate `ADD` signals

## 10. UI Structure

### 10.1 Tab 1: Action Centre

Primary question: what should I do this week?

Required display:

- Last reviewed date
- Market regime
- Actual YTD return
- Pro-rated target return
- Target gap
- Number of high-priority actions
- Top action list
- Suppressed signals count
- `Mark Reviewed` action

### 10.2 Tab 2: Portfolio Monitor

Required features:

- Add/edit/delete holdings
- Ticker, shares, average cost, current price, currency
- Editable FX rate for USD/HKD
- Current value in HKD
- Current weight
- Target weight
- Weight gap
- Position gain/loss
- Import/export JSON backup

### 10.3 Tab 3: Signal Feed

Required features:

- List all generated signals
- Show action, ticker, priority, reason, rule matched, and blockers
- Filter by action
- Filter by priority
- Filter blocked/suppressed signals
- Mark as executed
- Mark as ignored
- Send executed/ignored decision to Journal

### 10.4 Tab 4: ETF Universe

Required features:

- Table of ETF definitions
- Category, region, asset class, currency, risk level
- Price-derived momentum and editable regime fit
- Rebalance score
- Opportunity score
- Verdict badge
- Filter by category, region, and risk level

### 10.5 Tab 5: Journal

Required features:

- Decision history
- Date, action, ticker, amount, price, reason, regime
- Source signal ID
- Executed vs ignored status
- Notes field
- Export CSV
- Export JSON

## 11. Real Data Layer: Yahoo Finance via Vite Proxy

### 11.1 Why This Works Locally

This is a personal tool running on `localhost`. The Vite dev server acts as a reverse proxy, so there is no CORS issue in development. No backend is required.

```text
Browser → Vite proxy (/api/yahoo) → query1.finance.yahoo.com
```

For production deployment (optional future step), a Cloudflare Worker or Vercel Edge Function can replace the Vite proxy with one free function.

### 11.2 Vite Proxy Config

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/yahoo/, '')
      }
    }
  }
})
```

### 11.3 What to Fetch

Two endpoints per ticker:

```text
// Current price and basic info
GET /api/yahoo/v8/finance/chart/{ticker}

// Historical closes for MA calculation and period returns
GET /api/yahoo/v8/finance/chart/{ticker}?interval=1d&range=1y
```

From these two calls, derive locally:

- `currentPrice`
- `previousClose`
- `oneMonthReturn`, `threeMonthReturn`, `sixMonthReturn`, `oneYearReturn`
- `movingAverage50`
- `movingAverage200`

For USD/HKD FX, use the Yahoo Finance chart endpoint with `HKD=X` first. If that fails, fall back to the user's manual FX override.

### 11.4 HK ETF Ticker Format

Yahoo Finance uses the `.HK` suffix for HKEX-listed ETFs:

| ETF | Yahoo Finance ticker |
| --- | --- |
| 2800 (Tracker Fund) | `2800.HK` |
| 3067 (CSOP Hang Seng TECH) | `3067.HK` |
| 2840 (SPDR Gold HK) | `2840.HK` |
| 3188 (ChinaAMC CSI 300) | `3188.HK` |

HK ETF prices are returned in HKD. US ETF prices are returned in USD. The currency field on each ETF record determines which FX rate to apply.

### 11.5 Cache Strategy

Fetch on page load if cached data is older than the TTL. For a weekly review tool, a long TTL is acceptable.

```typescript
interface PriceCache {
  ticker: string
  data: ETFPriceData
  fetchedAt: string  // ISO timestamp
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000  // 4 hours

function isCacheStale(cache: PriceCache): boolean {
  return Date.now() - new Date(cache.fetchedAt).getTime() > CACHE_TTL_MS
}
```

Cached prices are stored in `localStorage` under key `priceCache:{ticker}`.

If a fetch fails, the app falls back to the last cached value and shows a warning badge in the Header.

FX data is cached separately under `fxCache:USDHKD`.

### 11.6 Batch Fetch on Page Load

On app start, fetch all tickers in the active ETF universe in parallel:

```typescript
const prices = await Promise.allSettled(
  activeTickers.map(ticker => yahooProvider.getPrice(ticker))
)
// Fulfilled → update cache
// Rejected → use cached or show stale warning
```

Do not re-fetch on every tab switch. Only re-fetch when user clicks the `Refresh Prices` button in the Header, or when TTL has expired.

### 11.7 DataProvider Interface

```typescript
// src/services/marketData/PriceProvider.ts
interface PriceProvider {
  getPrice(ticker: string): Promise<ETFPriceData>
  getBatch(tickers: string[]): Promise<Map<string, ETFPriceData>>
}

interface FxProvider {
  getUsdHkd(): Promise<FxRate>
}

// Phase 1
class YahooFinancePriceProvider implements PriceProvider { ... }
class YahooFinanceFxProvider implements FxProvider { ... }

// Fallback (used if fetch fails or in unit tests)
class MockPriceProvider implements PriceProvider { ... }
class ManualFxProvider implements FxProvider { ... }
```

The Signal Engine depends only on normalized market data, not on the Yahoo Finance implementation directly.

### 11.8 What Remains Manual (Holdings)

Price data is automatic. Holdings data is always manual:

| Data | Source | When updated |
| --- | --- | --- |
| Current price, MA, returns | Yahoo Finance auto-fetch | Page load / refresh |
| Ticker, shares, average cost | User input | After each trade |
| FX rate (USD/HKD) | Yahoo Finance `HKD=X`, with manual override | Page load / refresh / user override |
| Start-of-year portfolio value | User input once | January or first setup |
| Net contributions | User input | After each deposit/withdrawal |

---

## 12. File Structure

```text
vite.config.ts
src/
  engine/
    returnTracker.ts
    rebalance.ts
    marketRegime.ts
    scoring.ts
    riskGuards.ts
    signalResolver.ts
    signalEngine.ts
  data/
    etfUniverse.ts
    portfolioPresets.ts
    mockPortfolio.ts
    testScenarios.ts
  services/
    marketData/
      PriceProvider.ts
      FxProvider.ts
      yahooFinanceProvider.ts
      mockPriceProvider.ts
      manualFxProvider.ts
      normalizeMarketData.ts
      marketDataCache.ts
  types/
    etf.ts
    portfolio.ts
    signal.ts
    journal.ts
    market.ts
    price.ts
    fx.ts
  components/
    ActionCentre.tsx
    PortfolioMonitor.tsx
    SignalFeed.tsx
    ETFUniverseTable.tsx
    Journal.tsx
    Header.tsx
    TabNav.tsx
    StatusBadge.tsx
    SummaryCard.tsx
    ReturnTracker.tsx
  utils/
    currency.ts
    csv.ts
    formatting.ts
    localStorage.ts
  App.tsx
  main.tsx
  styles/
    global.css
    dashboard.css
```

## 13. Development Phases

### Phase 0: Real Data and Engine Specification

- TypeScript types
- Return formula
- Rule precedence
- Yahoo Finance price provider through Vite proxy
- USD/HKD FX provider with manual override
- Market data cache and stale warning rules
- ETF universe
- Manual holdings schema
- Mock provider only for unit tests and fetch fallback
- Test scenario matrix

Exit criteria:

- Engine inputs and outputs are documented.
- Real EOD prices can be fetched for US and HK ETFs.
- USD/HKD can be fetched or manually overridden.
- At least 8 deterministic test scenarios are defined.

### Phase 1: Real-Data Headless Engine

- `returnTracker`
- `rebalance`
- `marketRegime`
- `riskGuards`
- `scoring`
- `signalResolver`
- `signalEngine`
- normalized price data input
- stale/missing price handling

Exit criteria:

- Running the engine on manually entered holdings and fetched prices returns final action list and full signal feed.
- Missing or stale price data produces `DATA_REVIEW`, not unreliable buy/sell signals.
- Conflicting rules resolve predictably.
- No UI is required yet.

### Phase 2: Core Dashboard

- Action Centre
- Portfolio Monitor
- Signal Feed
- Basic tab navigation
- Local state persistence

Exit criteria:

- Opening the app answers the three weekly review questions.
- User can edit holdings, refresh prices, and immediately see updated signals.

### Phase 3: Persistence and Journal

- Journal
- Mark signal as executed/ignored
- CSV export
- JSON import/export backup
- Last reviewed tracking

Exit criteria:

- Weekly decisions survive page refresh.
- User can export a complete decision history.

### Phase 4: ETF Universe and Presets

- ETF Universe table
- Preset switching
- Editable market regime inputs
- Score breakdown display
- Monthly ETF universe review process

Exit criteria:

- User can compare ETF candidates and understand why each one is `ADD`, `WAIT`, or `AVOID`.
- ETF universe governance rules are documented and can be applied once per month without changing engine behaviour unexpectedly.

### Phase 5: Broker and Data Integrations

- Futu CSV import
- IBKR CSV import
- Additional price provider fallback
- FRED macro data provider
- Google Sheets sync

Exit criteria:

- Manual holdings entry is no longer required for standard weekly review.

## 14. Test Scenario Matrix

| Scenario | Expected Result |
| --- | --- |
| Underweight IEF in neutral regime | `ADD IEF` |
| Underweight QQQ while VIX > 25 | `WAIT QQQ`, blocked by risk-off regime |
| QQQ above 30% portfolio weight | `CONCENTRATION_REVIEW` |
| YTD ahead by more than 2% and QQQ overweight | `TRIM QQQ` or `HARVEST_REVIEW` |
| YTD behind by more than 5% | `REVIEW`, not automatic buying |
| HYG underweight while credit spreads widen | `WAIT HYG` |
| Gold trend positive while equities weak | `ADD GLD` if underweight and enabled |
| Missing current price | `DATA_REVIEW` |
| Stale cached price after failed refresh | Use stale value, show warning, and downgrade action confidence |
| HK trend weak and 3067.HK underweight | `WAIT 3067.HK` |
| Portfolio drawdown greater than 8% | `REDUCE_RISK_REVIEW` |

## 15. Weekly Review Success Criteria

The dashboard is useful only if it can answer these within five seconds:

1. Am I ahead, on track, or behind the 10% annual target?
2. Which ETF actions should I consider this week?
3. Which suggested actions are blocked by market regime or risk controls?
4. What changed since the last review?
5. What decisions did I execute or ignore?
6. Are any prices stale, missing, or manually overridden?

If these are unclear, the phase is not complete.

## 16. Codex Build Strategy

### Task 1: Scaffold and Real Data Layer

Create Vite + React + TypeScript, configure the Yahoo Finance Vite proxy, define market data types, build price/FX providers, caching, stale warnings, and test scenarios. No polished UI yet.

### Task 2: Headless Signal Engine

Build the headless Signal Engine against normalized real price data and manual holdings. Include mock providers only for tests and fallback.

### Task 3: Core UI

Build Action Centre, Portfolio Monitor, and Signal Feed. Keep the UI dense, dashboard-like, and built for weekly use.

### Task 4: Persistence and Journal

Add localStorage persistence, Journal, executed/ignored decisions, CSV export, JSON backup, and last reviewed state.

### Task 5: ETF Universe and Polish

Add ETF Universe, score breakdowns, preset switching, editable market regime inputs, responsive layout, and visible disclaimer.

## 17. Disclaimer

This dashboard is for personal portfolio planning and decision support only. It does not provide financial advice, automated trading, guaranteed returns, or broker execution. Price data may be delayed, stale, unavailable, or manually overridden. Projected returns and market indicators are scenario estimates only.
