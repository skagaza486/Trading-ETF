# Technical Overview — Global ETF & Stock Signal App

> Research-phase tactical signal tool. All outputs are for personal study only, not investment advice.

---

## 1. Stack

| Layer | Technology |
|---|---|
| UI framework | React 18 + TypeScript (strict) |
| Build tool | Vite 8 |
| Styling | Plain CSS (no framework), IBM Plex Sans + Space Grotesk fonts |
| Runtime (prod) | Cloudflare Workers (edge) |
| Data — prices | Yahoo Finance (via proxy) |
| Data — earnings | Finnhub API (optional) |
| State | React `useState` / `useEffect` only — no external state library |
| Persistence | None (all computed on load; no database) |

---

## 2. Repository Layout

```
/
├── src/
│   ├── App.tsx                        # Single root component; all pages, state, data-fetch
│   ├── main.tsx                       # React mount
│   ├── data/
│   │   ├── etfUniverse.ts             # ETF master list (~50 ETFs with metadata)
│   │   └── watchlist.ts               # Stock watchlist (~100 tickers)
│   ├── engine/                        # Pure computation — no React, no fetch
│   │   ├── indicatorEngine.ts         # EMA, RSI, MACD, CMF, OBV, RVOL, CLV, ATR
│   │   ├── marketRegime.ts            # SPY/QQQ/VIX → RegimeClass
│   │   ├── historyUtils.ts            # Bar aggregation, rolling mean, slope, etc.
│   │   ├── etfWeeklyEngine.ts         # Weekly ETF classification → ETFRecommendation
│   │   ├── etfReplayEngine.ts         # Rolling 26-week ETF replay
│   │   ├── signalClassifier.ts        # Stock signal gate logic → StockSignalLabel
│   │   ├── stockScreenerEngine.ts     # Per-ticker daily indicator compute → StockSignal
│   │   ├── stockResearchEngine.ts     # Historical signals + forward-return records
│   │   └── researchGate.ts            # Six-gate statistical validation
│   ├── services/marketData/
│   │   ├── yahooFinanceProvider.ts    # Fetch OHLCV bars via /api/yahoo proxy
│   │   ├── earningsProvider.ts        # Fetch earnings dates via /api/finnhub
│   │   ├── normalizeMarketData.ts     # Raw Yahoo JSON → TickerHistory
│   │   └── marketDataCache.ts         # In-memory cache for current session
│   ├── types/
│   │   ├── signal.ts                  # ETFLabel, StockSignalLabel, indicator snapshots
│   │   ├── indicator.ts               # OHLCVBar, TickerHistory
│   │   ├── market.ts                  # RegimeClass, RegimeInputs, MarketRegime
│   │   ├── research.ts                # ForwardReturnRecord
│   │   └── replay.ts                  # ETFReplayWeek
│   ├── ui/
│   │   └── labelDisplay.ts            # Label → Chinese text, emoji, plain reason
│   └── styles/
│       ├── global.css                 # Design tokens, reset, body
│       └── dashboard.css              # All component styles + responsive breakpoints
├── worker.ts                          # Cloudflare Worker entry point (API proxy + assets)
├── wrangler.toml                      # Cloudflare config
├── vite.config.ts                     # Dev-server proxy for Yahoo / Finnhub / FRED
└── .env.local                         # FINNHUB_API_KEY (gitignored)
```

---

## 3. Data Flow

```
Browser loads SPA
       │
       ▼
App.tsx useEffect → fetchYahooTickerHistory(ticker)
       │                      │
       │              GET /api/yahoo/v8/finance/chart/{ticker}
       │                      │
       │         ┌────────────┴────────────┐
       │    [dev] Vite middleware        [prod] worker.ts
       │    curl → query1.finance.yahoo  fetch → query1/query2.finance.yahoo
       │
       ▼
normalizeMarketData → TickerHistory { ticker, bars: OHLCVBar[] }
       │
       ▼
Engine layer (pure functions, no async):
  marketRegime.ts   → RegimeClass ('long_friendly' | 'short_friendly' | 'neutral')
  etfWeeklyEngine   → ETFRecommendation[] (one per ETF)
  stockScreenerEngine → StockSignal[] (one per watchlist stock)
       │
       ▼
App.tsx setState → React renders 5 tabs
```

---

## 4. Market Regime (`marketRegime.ts`)

Regime is computed from 5 benchmark signals every refresh:

| Input | Signal |
|---|---|
| `spyAboveEma50` | SPY close ≥ 50-day EMA |
| `qqqAboveEma50` | QQQ close ≥ 50-day EMA |
| `vixLevel` | Latest VIX close |
| `hkMarketAboveEma40w` | 2800.HK close ≥ 200-day EMA (≈ 40-week) |
| `goldAboveEma40w` | GLD close ≥ 200-day EMA |

**Decision rules:**
- `RISK_OFF` (→ `short_friendly`) if VIX > 28 OR ≥2 of {SPY below EMA50, QQQ below EMA50, HK below EMA40w}
- `RISK_ON` (→ `long_friendly`) if VIX < 22 AND SPY above EMA50 AND QQQ above EMA50
- Otherwise `NEUTRAL`

Regime is consumed by both ETF and stock engines to apply directional filters.

---

## 5. Indicator Engine (`indicatorEngine.ts`)

All functions take `OHLCVBar[]` and return per-bar arrays with `null` for insufficient history.

| Function | Output | Used by |
|---|---|---|
| `computeEMA(bars, period)` | EMA values | regime, ETF/stock engines |
| `computeRSI(bars, 14)` | RSI (Wilder's) | stock screener |
| `computeMACD(bars)` | `{ line, signal, histogram }[]` | stock screener |
| `computeCMF(bars, 20)` | Chaikin Money Flow | stock screener |
| `computeOBV(bars)` | On-Balance Volume | stock screener (slope) |
| `computeRVOL(bars, 20)` | Relative Volume vs 20-bar avg | stock screener |
| `computeCLV(bars)` | Close Location Value | stock screener |
| `computeATR(bars, 14)` | Average True Range | breakout margin |
| `computeEMASlope(ema, lookback)` | % rate of change of EMA | ETF engine |

---

## 6. ETF Weekly Engine (`etfWeeklyEngine.ts`)

Runs on **weekly aggregated** OHLCV bars (daily bars collapsed to weekly in `historyUtils.ts`).

**Inputs per ETF:** weekly closes, SPY weekly closes, VIX level, regime.

**Derived metrics:**
- `return13w` — 13-week price return
- `return26w` — 26-week price return
- `priceVs10wMa` — close / 10-week SMA
- `priceVs40wMa` — close / 40-week SMA
- `ma10Slope` — week-on-week % change of 10W MA
- `relStrengthVsSpy` — 13W return minus SPY 13W return

**Label logic (priority waterfall):**

```
AVOID  if priceVs40wMa < 1 AND return13w ≤ 0 AND return26w ≤ 0 AND RS ≤ 0
FAVOUR if priceVs10wMa ≥ 1 AND priceVs40wMa ≥ 1 AND return13w > 0
         AND (ma10Slope > 0 OR return26w > 0) AND RS > 0
WATCH  if priceVs10wMa ≥ 0.99 AND (ma10Slope > 0 OR return13w > 0 OR RS > 0)
WAIT   (default)
```

**Regime override:** In `short_friendly`, FAVOUR → WAIT, WATCH → WAIT (except safe-haven ETFs: GLD, IAU, SGOV, SHY, IEF, TLT, BIL, TIP).

---

## 7. Stock Screener Engine (`stockScreenerEngine.ts`)

Runs on **daily** OHLCV bars for each watchlist stock.

**Indicators computed per bar:**
- EMA20, EMA50, EMA200
- EMA20 slope (5-bar regression)
- RSI(14), MACD histogram, CMF(20)
- RVOL(20), CLV, OBV slope (10-bar regression)
- ATR(14)-adjusted breakout/breakdown vs 20-day range
- Relative strength vs SPY (65-bar lookback)
- Flags: `aboveEma200`, `nearHigh52w`, `breakout20d`, `breakdown20d`

**Signal labels (from `signalClassifier.ts`):**

```
REVIEW_DATA    — any required indicator is null
REVIEW_EVENT   — earnings within ±7 days (via Finnhub)
AVOID_CHOP     — RSI 45–55, RVOL < 0.8, EMA20 slope near zero, no breakout/breakdown

LONG ladder (each requires regime ≠ short_friendly):
  LONG_WATCH   — RSI > 50, MACD hist > 0, CMF > 0, OBV rising
  LONG_SETUP   — close > EMA20, EMA20 slope > 0, RSI > 55, RVOL > 1.2, CMF > 0, above EMA200
  LONG_CONFIRM — 20d breakout, RVOL > 1.8, CMF > 0.1, CLV > 0.65, EMA20 > EMA50, RSI > 55, near 52w high
                 + HYP-009: requires prior bar to be LONG_WATCH/LONG_SETUP/LONG_CONFIRM
  UP_PROMOTION — LONG_SETUP → LONG_CONFIRM with prior LONG_SETUP label

SHORT ladder (mirror, requires regime ≠ long_friendly):
  SHORT_WATCH, SHORT_SETUP, SHORT_CONFIRM, DOWN_PROMOTION

NEUTRAL        — default
```

---

## 8. ETF Replay Engine (`etfReplayEngine.ts`)

For each of the last 26 completed calendar weeks, re-runs `classifyETF` using only data available up to that week's Friday. Captures:
- `ret1w` — 1-week forward return after signal
- `ret4w` — 4-week forward return after signal

Used in "ETF Replay" tab to compute FAVOUR win rate vs SPY and alpha.

---

## 9. Stock Research Engine (`stockResearchEngine.ts`)

Builds a `ForwardReturnRecord[]` dataset:
- Replays signals over the last 180 daily bars per ticker
- For each signal date, records forward returns: 1D, 3D, 5D, 10D
- Also records: 5D vs SPY excess return, MFE(5D), MAE(5D), earnings-in-window flag

Used in "Stock Replay" (per-ticker signal history) and "Stock Research" (gate evaluation).

---

## 10. Six-Gate Research Validation (`researchGate.ts`)

For each directional signal label (LONG_WATCH through DOWN_PROMOTION), evaluates:

| Gate | Test |
|---|---|
| G1 Sample Size | n ≥ 100 |
| G2 Direction | avg 5D return > 0 (long) or < 0 (short) |
| G3 vs SPY | avg 5D excess > +0.5% (long) or < −0.5% (short) |
| G4 Consistent | both first-half and second-half of records directionally correct |
| G5 Neutral Regime | signal still works in neutral regime |
| G6 MAE | avg max adverse excursion 5D < 3% |

**Status:** PASS (all gates), FAIL (G1 met but a gate fails), INSUFFICIENT (G1 not met).

---

## 11. ETF Universe (`data/etfUniverse.ts`)

~50 ETFs across 8 categories:

| Category | Examples |
|---|---|
| US Treasury / Bond | SGOV, SHY, IEF, TLT, TIP, BND, LQD |
| US Equity Core & Factor | VOO, VTI, QQQ, IWM, MTUM, IWF, IWD |
| High Yield Bond | HYG, JNK |
| International Equity | VXUS, EFA, EEM, EWJ, EWT, INDA, EWZ, EWG, ACWI |
| HK / China | 2800.HK, 3067.HK, 2828.HK, 3188.HK, KWEB, FXI |
| Gold & Commodities | GLD, IAU, 2840.HK, GDX, SLV, PDBC, DBA |
| REIT | VNQ |
| Sector (US) | XLK, XLF, XLI, XLU, XLP, XLY, XBI, ITB, SMH, XLV, XLE, SCHD, VIG |

Benchmarks fetched separately: SPY, QQQ, ^VIX (ETF module); SPY, QQQ, IWM, ^VIX, GLD, 2800.HK (stock module).

---

## 12. UI — Five Tabs

All rendered within a single `App.tsx` component. No router.

| Tab | Content |
|---|---|
| **ETF Weekly** | 4 summary cards (FAVOUR/WATCH/AVOID/REVIEW counts) + card/table toggle for all ETFs |
| **ETF Replay** | Rolling 26-week replay table; FAVOUR vs SPY win rate, alpha stats |
| **Stock Screener** | 4 summary cards (LONG/SHORT/NEUTRAL/REVIEW counts) + card/table toggle for ~100 stocks |
| **Stock Replay** | Per-ticker signal history with forward-return outcomes, colour-coded correctness |
| **Stock Research** | Forward-return dataset + 6-gate validation table; currently all labels INSUFFICIENT |

### Card vs Table toggle
Both ETF Weekly and Stock Screener offer a 卡片/列表 toggle (`etfViewMode`, `stockViewMode`), both defaulting to `'cards'`. Cards are the mobile-friendly default; tables are for dense data on desktop.

---

## 13. Label Display System (`ui/labelDisplay.ts`)

Maps every signal label to a `{ lightEmoji, zhText, plainReason, action, actionGroup }` record for the UI. All Chinese text is Cantonese-flavoured (e.g. "唔好接", "先睇住").

ETF labels: FAVOUR → 值得留意, WATCH → 留意觀望, WAIT → 靜候信號, AVOID → 避開, REVIEW → 資料不足

Stock labels (12 total): UP_PROMOTION, LONG_CONFIRM, LONG_SETUP, LONG_WATCH, NEUTRAL, AVOID_CHOP, SHORT_WATCH, SHORT_SETUP, SHORT_CONFIRM, DOWN_PROMOTION, REVIEW_DATA, REVIEW_EVENT

---

## 14. API Proxy Layer

The app never calls external APIs directly from the browser (CORS). All market data goes through `/api/*` routes:

| Route | Upstream | Purpose |
|---|---|---|
| `/api/yahoo/*` | query1/query2.finance.yahoo.com | OHLCV price history |
| `/api/finnhub/*` | finnhub.io/api/v1 | Earnings calendar (current + historical) |
| `/api/fred/*` | fred.stlouisfed.org | Macro data (dev only; not used in prod) |

**Local dev:** `vite.config.ts` registers Vite middleware that calls `curl` for each route (avoids browser CORS, works with Yahoo's HTTP/1.1 requirements).

**Production:** `worker.ts` (Cloudflare Worker) handles the same routes, falls through to `env.ASSETS.fetch(request)` for static SPA files.

---

## 15. Deployment (Cloudflare Workers)

**`wrangler.toml`:**
```toml
name = "trading-etf"
compatibility_date = "2025-01-01"
main = "worker.ts"

[assets]
directory = "./dist"
binding = "ASSETS"
```

**Deploy steps:**
```bash
node node_modules/.bin/vite build   # produces ./dist
# push to GitHub → Cloudflare auto-deploys via Git integration
```

**Environment variable required in Cloudflare dashboard:**
- `FINNHUB_API_KEY` — enables earnings data (without it, earnings risk is silently disabled)

**Live URL:** https://trading-etf.pages.dev (or custom Cloudflare subdomain)

---

## 16. Local Development

```bash
# Prerequisites: node at .tools/node-v22.22.3-darwin-arm64/bin/node
cp .env.local.example .env.local   # add FINNHUB_API_KEY=...
node node_modules/.bin/vite         # dev server at localhost:5173
node node_modules/.bin/tsc --noEmit # type check
node node_modules/.bin/vite build   # production build
```

`.env.local` is gitignored (`*.local` in `.gitignore`).

---

## 17. Responsive Design

Breakpoints in `dashboard.css`:

| Breakpoint | Key changes |
|---|---|
| `≤ 1024px` | Dashboard grid → 2-col; hero metrics → horizontal scroll flex |
| `≤ 900px` | Market/settings grids → 2-col; signal rows → single col |
| `≤ 640px` | Tab nav nowrap + scroll; status chips nowrap + scroll; hero metrics → 3-col grid; ETF cards 2-col; stock cards 1-col; ETF name clamped to 2 lines; sector label hidden |
| `≤ 480px` | Hero eyebrow hidden; summary cards compact 2-col; description text hidden; hero metric font shrinks |

Bottom padding is 80px at mobile to prevent the help FAB (`position: fixed; bottom: 24px; right: 24px`) from overlapping content.

---

## 18. Key Types Reference

```typescript
// types/indicator.ts
type OHLCVBar = { date: string; open: number; high: number; low: number; close: number; volume: number }
type TickerHistory = { ticker: string; bars: OHLCVBar[] }

// types/signal.ts
type RegimeClass = 'long_friendly' | 'short_friendly' | 'neutral'
type ETFLabel = 'FAVOUR' | 'WATCH' | 'WAIT' | 'AVOID' | 'REVIEW'
type StockSignalLabel =
  | 'UP_PROMOTION' | 'LONG_CONFIRM' | 'LONG_SETUP' | 'LONG_WATCH'
  | 'DOWN_PROMOTION' | 'SHORT_CONFIRM' | 'SHORT_SETUP' | 'SHORT_WATCH'
  | 'NEUTRAL' | 'AVOID_CHOP' | 'REVIEW_DATA' | 'REVIEW_EVENT'

// types/research.ts
type ForwardReturnRecord = {
  ticker: string; signalDate: string; label: StockSignalLabel
  regimeAtSignal: RegimeClass; closeAtSignal: number
  ret1d: number|null; ret3d: number|null; ret5d: number|null; ret10d: number|null
  ret5dVsSpy: number|null; mfe5d: number|null; mae5d: number|null
  earningsInWindow: boolean
}
```

---

## 19. Known Constraints & Design Decisions

- **No backend / no database.** All computation is client-side. Each browser session re-fetches everything from scratch (session-level in-memory cache only).
- **Yahoo Finance is unofficial.** The proxy works with `curl` using a browser User-Agent. Rate limiting or format changes can break data fetch.
- **Finnhub earnings is optional.** Without `FINNHUB_API_KEY`, `REVIEW_EVENT` labels never fire; earnings risk filtering is silently disabled.
- **HYP-009 rule:** LONG_CONFIRM and SHORT_CONFIRM require the prior bar to be in the same direction ladder, preventing single-bar impulse breakouts from mislabelling.
- **Research phase:** All six gates are currently INSUFFICIENT (n < 100). The app is a signal generator and backtesting workspace, not a validated trading system.
- **Safe-haven override:** GLD, IAU, SGOV, SHY, IEF, TLT, BIL, TIP are immune to regime downgrades in the ETF engine.

---

*Last updated: 2026-06-18*
