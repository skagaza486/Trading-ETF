# Technical Overview — Global ETF & Stock Signal App

> Research-phase tactical signal tool. All outputs are for personal study only, not investment advice.

---

## 1. Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 + TypeScript (strict) |
| Build tool | Vite 8 |
| Styling | Plain CSS (no framework), IBM Plex Sans + Space Grotesk fonts |
| Runtime (prod) | Cloudflare Workers (edge) |
| Data — prices | Yahoo Finance (via cron; Worker fetches daily) |
| Data — earnings | Finnhub API (optional) |
| State | React `useState` / `useEffect` only — no external state library |
| Persistence — KV | Cloudflare KV: daily snapshot (stocks + regime + RS rank) |
| Persistence — D1 | Cloudflare D1 (SQLite): signals + forward returns (2yr history) |

---

## 2. Repository Layout

```
/
├── src/
│   ├── engine/                        # Pure computation — no React, no fetch
│   │   ├── indicatorEngine.ts         # EMA, RSI, MACD, CMF, OBV, RVOL, CLV, ATR
│   │   ├── marketRegime.ts            # SPY/QQQ/VIX/RSP → RegimeClass + proxyWeakBreadth
│   │   ├── historyUtils.ts            # Bar aggregation, rolling mean, slope, etc.
│   │   ├── etfWeeklyEngine.ts         # Weekly ETF classification → ETFRecommendation
│   │   ├── etfReplayEngine.ts         # Rolling 26-week ETF replay
│   │   ├── signalClassifier.ts        # Stock signal gate logic → StockSignalLabel
│   │   ├── stockScreenerEngine.ts     # Per-ticker daily indicator compute → StockSignal
│   │   ├── stockResearchEngine.ts     # Forward-return record helpers + buildHistoricalSignals
│   │   └── researchGate.ts            # Seven-gate statistical validation + rolling robustness
│   ├── data/
│   │   ├── etfUniverse.ts             # ETF master list (~50 ETFs with metadata)
│   │   └── watchlist.ts               # Stock watchlist (299 tickers, tier 1/2)
│   ├── services/marketData/
│   │   ├── yahooFinanceProvider.ts    # Fetch OHLCV bars via /api/yahoo proxy
│   │   ├── snapshotProvider.ts        # Fetch KV snapshot from /api/snapshot/latest
│   │   ├── earningsProvider.ts        # Fetch earnings dates via /api/finnhub
│   │   ├── normalizeMarketData.ts     # Raw Yahoo JSON → TickerHistory
│   │   └── marketDataCache.ts         # In-memory cache for current session
│   ├── worker/
│   │   └── cronSnapshot.ts            # Cron: fetch 299 stocks, classify, write KV+D1; backfill endpoint
│   ├── types/
│   │   ├── signal.ts                  # ETFLabel, StockSignalLabel, indicator snapshots
│   │   ├── indicator.ts               # OHLCVBar, TickerHistory
│   │   ├── market.ts                  # RegimeClass, RegimeInputs, MarketRegime
│   │   ├── research.ts                # ForwardReturnRecord
│   │   ├── snapshot.ts                # DailySnapshot, StockSnapshotEntry (incl. marketCap?, liquidityNote)
│   │   └── replay.ts                  # ETFReplayWeek
│   ├── ui/
│   │   └── labelDisplay.ts            # Label → Chinese text, emoji, plain reason
│   └── web/                           # UI 2.0 greenfield (5-tab architecture)
│       ├── features/
│       │   ├── market/                # MarketView — weather card, index strip, story grid
│       │   ├── sectors/
│       │   │   ├── SectorsView.tsx    # Sector leadership + treemap container
│       │   │   ├── SectorTreemap.tsx  # Pro-only: CSS flex treemap, tile width ∝ marketCap
│       │   │   └── *.module.css
│       │   ├── discover/              # DiscoverView — stock/ETF cards with sparklines
│       │   ├── detail/                # DetailView — stock detail, Finnhub news, earnings
│       │   └── lab/                   # LabView — Quant Lab (gate summary, robustness, perf-by-period)
│       ├── shared/hooks/              # useSnapshot, useEtfSignals, usePerfByPeriod, …
│       └── app/                       # AppContext (openDetail, uiMode, marketScope)
├── scripts/
│   ├── build-snapshot.ts              # GH Actions runner: snapshot + FRED liquidity + Yahoo market caps → POST ingest
│   ├── fredLiquidity.ts               # FRED WALCL/WTREGEN/RRPONTSYD → LiquidityNote (slope ±100B)
│   ├── yahooMarketCap.ts              # Yahoo /v8/finance/quote batch fetch (80 tickers/req) → Map<ticker,cap>
│   ├── researchAgent.ts               # CLI: fetch histories + historical earnings → buildHistoricalSignals → D1
│   └── ml/
│       ├── requirements.txt           # pandas, numpy, scikit-learn, joblib
│       ├── fetch_signals.py           # Pull settled D1 signals → data/signals.csv
│       └── label.py                   # Triple-Barrier Method (k=1.5) → data/labeled.csv (tb_label col)
├── schema/
│   ├── d1-init.sql                    # D1 table definitions (signals, gate_snapshots)
│   └── d1-migrate-b2.sql              # Migration: add 15 forward-return columns to signals
├── tests/
│   └── ui/                            # Playwright smoke tests (navigation / layout / lab)
├── .github/workflows/
│   └── snapshot.yml                   # Cron 21:30 UTC Mon–Fri; secrets: INGEST_TOKEN, FRED_API_KEY
├── worker.ts                          # Cloudflare Worker entry (API routes + assets; dead scheduled() handler)
├── wrangler.toml                      # Cloudflare config (KV, D1; no cron — see snapshot.yml)
├── vite.config.ts                     # Dev-server proxy for Yahoo / Finnhub
└── .env.local                         # FINNHUB_API_KEY (gitignored)
```

---

## 3. Data Flow

### Stocks tab (pure renderer — reads KV snapshot)

```text
GitHub Actions (primary, Node, 21:30 UTC Mon–Fri)
  scripts/build-snapshot.ts
  → buildDailySnapshot (concurrency=3, retries=4) — fetch 299 stocks
  → fetchFredLiquidity (WALCL/WTREGEN/RRPONTSYD → LiquidityNote)   [parallel]
  → fetchYahooMarketCaps (Yahoo /v8/finance/quote, 80/batch)        [sequential after]
  → POST /api/admin/ingest-snapshot (Bearer INGEST_TOKEN)
       → Worker: KV put + writeSignalsToD1 + settleForwardReturns

Worker Cron — REMOVED (no [triggers] block in wrangler.toml)
  worker.ts still has a scheduled() handler calling buildDailySnapshot,
  but it never fires. GitHub Actions is the only daily pipeline.
  (Manual on-demand run still available via POST /api/admin/run-snapshot,
   but it is subrequest/rate-limited to ~43 stocks.)

Browser (Stocks tab)
  → GET /api/snapshot/latest → read KV → StockSnapshotEntry[]
  → buildStockRowsFromSnapshot → display (pure renderer, no re-classification)
```

### Verify/Quant Lab tab (reads D1)

```text
Browser (Verify tab)
  → GET /api/d1/signals?days=365 → D1 query → ForwardReturnRecord[]
  → gate evaluation + rolling robustness → display
```

### ETF tab (still live Yahoo in browser)

```text
Browser (ETF tab)
  → GET /api/yahoo/v8/finance/chart/{ticker}
  → etfWeeklyEngine → ETFRecommendation[] → display
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

Two-layer design: every entry signal requires both **Structure** (stock in the right position) and **Trigger** (something changed today or recently).

```
REVIEW_DATA    — any required indicator is null
REVIEW_EVENT   — earnings within ±7 days (via Finnhub)
AVOID_CHOP     — RSI 45–55, RVOL < 0.8, EMA20 slope near zero, no breakout/breakdown

Universe filter (not an entry signal, not gate-evaluated):
  WATCH        — RSI > 50, MACD hist > 0, CMF > 0, OBV rising, RS > -0.02
                 Purpose: watchlist candidate pool only

LONG entry signals (each requires regime ≠ short_friendly):
  LONG_BASE    — Structure: above EMA200, EMA20 > EMA50, EMA50 slope > 0, RS > 0
                 Compression: atrSlope50 < 0 OR rvolRecentAvg10 < 0.8; RSI 45–65
                 (setup awaiting trigger — not yet an entry)
  LONG_VCP     — Volatility Contraction Pattern: above EMA200, ATR contracting 50D,
                 prior 10D avg RVOL < 0.8, today breakout20d + RVOL > 1.5
  LONG_BOUNCE  — Structure: long_friendly regime, EMA50 slope > 0, above EMA200, EMA20 > EMA50
                 Multi-bar trigger: recentPullbackNearEma20 (any of last 5 bars low ≤ EMA20×1.02)
                 + today close > EMA20, RSI 42–58, CLV > 0.6
  LONG_BREAK   — Structure: EMA20 > EMA50, above EMA200, near 52w high
                 Trigger: breakout20d + RVOL > 1.8 + CMF > 0.1 + CLV > 0.65
                 + HYP-009: prior bar must be in long ladder

SHORT entry signals (frozen — 2024-2026 bull market sample biases results):
  SHORT_WATCH, SHORT_BASE, SHORT_BREAK

NEUTRAL        — default
```

**Research-stage signals (not yet in production classifier):**

- `AVOID_DISTRIBUTION` — Wyckoff distribution flag: RVOL > 2.5 + stagnant close / long upper shadow + within 5% of 52-week high. Tracked as `patternTag` pending Gate validation. See ROADMAP R8.

---

## 8. ETF Replay Engine (`etfReplayEngine.ts`)

For each of the last 26 completed calendar weeks, re-runs `classifyETF` using only data available up to that week's Friday. Captures:
- `ret1w` — 1-week forward return after signal
- `ret4w` — 4-week forward return after signal

Used in "ETF Replay" tab to compute FAVOUR win rate vs SPY and alpha.

---

## 9. Stock Research Engine (`stockResearchEngine.ts`)

Provides helpers for building `ForwardReturnRecord[]`. In production (B2+), forward returns are **computed server-side by the daily pipeline** (`cronSnapshot.ts → settleForwardReturns`, run via GitHub Actions) and stored in D1. The browser reads them via `/api/d1/signals` — no client-side replay.

`stockResearchEngine.ts` is still used by the cron for helper utilities. Key functions:

- `buildForwardReturnRecordsLite` — lightweight forward-return computation from price history
- `settleForwardReturns` — queries D1 for signals with NULL ret5d (past 15 days), fills in actual forward prices

D1 `signals` table forward-return columns: `ret1d`, `ret3d`, `ret5d`, `ret10d`, `ret5d_vs_spy`, `ret10d_vs_spy`, `mfe5d`, `mae5d`, `mfe10d`, `mae10d`, `earnings_in_window`, `suggested_stop_loss`, `stop_loss_hit`, `atr_at_signal`, `close_at_signal`.

---

## 10. Six-Gate Research Validation (`researchGate.ts`)

For each directional signal label (LONG_BREAK, LONG_VCP, LONG_BOUNCE, LONG_BASE, SHORT_BREAK, SHORT_BASE, SHORT_WATCH), evaluates:
Note: WATCH is excluded — it is a universe filter, not an entry signal.

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

## 12. UI — Tabs

All rendered within a single `App.tsx` component. No router.

**Current structure (4 tabs — I7 complete):**

| Tab | Content |
|---|---|
| **Dashboard** | Regime hero + Action Radar (today's LONG_BREAK / LONG_BOUNCE / LONG_VCP top 3) + Sector Snapshot (top/bottom 3 ETFs) |
| **Stocks** | 4 summary cards (LONG/SHORT/NEUTRAL/REVIEW) + card/table toggle for ~100 stocks |
| **ETFs** | 4 summary cards (FAVOUR/WATCH/AVOID/REVIEW) + accordion by sector, sparklines, RS slope badge, ATR-stop indicator |
| **Quant Lab** | Sub-tabs: ETF Replay · Stock Replay · Stock Research (gate evaluation + rolling robustness) |

### Card vs Table toggle
Both ETF Weekly and Stock Screener offer a 卡片/列表 toggle (`etfViewMode`, `stockViewMode`), both defaulting to `'cards'`. Cards are the mobile-friendly default; tables are for dense data on desktop.

---

## 13. Label Display System (`ui/labelDisplay.ts`)

Maps every signal label to a `{ lightEmoji, zhText, plainReason, action, actionGroup }` record for the UI. All Chinese text is Cantonese-flavoured (e.g. "唔好接", "先睇住").

ETF labels: FAVOUR → 值得留意, WATCH → 留意觀望, WAIT → 靜候信號, AVOID → 避開, REVIEW → 資料不足

Stock labels (11 total): WATCH, LONG_BASE, LONG_VCP, LONG_BOUNCE, LONG_BREAK, NEUTRAL, AVOID_CHOP, SHORT_WATCH, SHORT_BASE, SHORT_BREAK, REVIEW_DATA, REVIEW_EVENT

---

## 14. API Proxy Layer

The app never calls external APIs directly from the browser (CORS). All market data goes through `/api/*` routes:

| Route | Upstream / Source | Purpose |
|---|---|---|
| `/api/yahoo/*` | query1/query2.finance.yahoo.com | OHLCV price history (ETF tab + cron) |
| `/api/finnhub/*` | finnhub.io/api/v1 | Earnings calendar (current + historical) |
| `/api/snapshot/latest` | Cloudflare KV | Daily stock snapshot (Stocks tab) |
| `/api/d1/signals` | Cloudflare D1 | Forward-return records (Verify tab) |
| `/api/admin/backfill` | Cloudflare D1 | One-time historical backfill (30 stocks/call) |

**Local dev:** `vite.config.ts` registers Vite middleware that proxies `/api/yahoo` and `/api/finnhub` (avoids browser CORS). KV/D1 routes only work in production Worker.

**Production:** `worker.ts` handles all routes, falls through to `env.ASSETS.fetch(request)` for static SPA files.

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

[[kv_namespaces]]
binding = "SNAPSHOT_KV"

[[d1_databases]]
binding = "trading_etf_db"
database_name = "trading-etf-db"

# No [triggers] block — Worker cron was removed; GitHub Actions
# (.github/workflows/snapshot.yml) runs the daily snapshot at 21:30 UTC Mon–Fri.
```

**Deploy steps (always both together):**
```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/vite build
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler deploy
```

Never run `wrangler deploy` alone — `dist/` would be stale.

**Environment variables required in Cloudflare dashboard:**
- `FINNHUB_API_KEY` — enables earnings data (without it, earnings risk is silently disabled)

**Live URL:** <https://trading-etf.skagaza486.workers.dev>

**Target worker name:** `trading-etf` (with hyphen). There is an older worker `tradingetf` (no hyphen) — do not deploy to it.

---

## 16. Local Development

```bash
# node/npm are NOT on system PATH — always use the bundled binary:
alias node='.tools/node-v22.22.3-darwin-arm64/bin/node'

cp .env.local.example .env.local          # add FINNHUB_API_KEY=...
node node_modules/.bin/vite               # dev server at localhost:5173
node node_modules/.bin/tsc --noEmit       # type check (zero errors required)
node node_modules/.bin/vite build         # production build → dist/
node node_modules/.bin/wrangler deploy    # deploy (always after build)
```

`.env.local` is gitignored. D1 and KV routes (`/api/snapshot/latest`, `/api/d1/signals`) only work in production; the dev server proxies only Yahoo and Finnhub.

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
  | 'WATCH' | 'LONG_BASE' | 'LONG_VCP' | 'LONG_BOUNCE' | 'LONG_BREAK'
  | 'SHORT_WATCH' | 'SHORT_BASE' | 'SHORT_BREAK'
  | 'NEUTRAL' | 'AVOID_CHOP' | 'REVIEW_DATA' | 'REVIEW_EVENT'

// types/research.ts
type ForwardReturnRecord = {
  ticker: string; signalDate: string; label: StockSignalLabel
  regimeAtSignal: RegimeClass; closeAtSignal: number
  ret1d: number|null; ret3d: number|null; ret5d: number|null; ret10d: number|null
  ret5dVsSpy: number|null; ret10dVsSpy: number|null
  mfe5d: number|null; mae5d: number|null; mfe10d: number|null; mae10d: number|null
  earningsInWindow: boolean; rvolAtSignal: number|null; atrAtSignal: number|null
  suggestedStopLoss: number|null; stopLossHit: boolean|null; researchFlags: string[]
}

// types/snapshot.ts
type DailySnapshot = {
  date: string; generatedAt: string; regime: RegimeClass; stocks: StockSnapshotEntry[]
}
type StockSnapshotEntry = {
  ticker: string; tier: 1|2; label: StockSignalLabel
  close: number; rvol: number|null; rsi: number|null; rsRank: number
}
```

---

## 19. Known Constraints & Design Decisions

- **Stocks tab is a pure renderer.** Labels are computed by the daily pipeline (GitHub Actions) and stored in KV. The browser reads the snapshot directly — no re-classification. If the pipeline hasn't run, the tab shows an error.
- **Verify tab reads D1 only.** `loadResearchData` fetches `/api/d1/signals` — no client-side replay. Records only appear after the daily pipeline has run and settled forward returns (5 trading days lag for ret5d).
- **ETF tab still fetches Yahoo live.** Each browser session re-fetches ETF OHLCV bars from Yahoo via `/api/yahoo`. This is acceptable given the small ETF universe (~50 tickers).
- **Forward returns require 5 trading days to settle.** Signals from the last 5 days will have `ret5d = NULL` and are excluded from the Verify tab query.
- **Yahoo Finance is unofficial.** Rate limiting or format changes can break data fetch. The snapshot builder retries query1/query2 endpoints automatically.
- **Finnhub earnings is optional.** Without `FINNHUB_API_KEY`, `REVIEW_EVENT` labels never fire; earnings risk filtering is silently disabled.
- **HYP-009 rule:** LONG_BREAK and SHORT_BREAK require the prior bar to be in the same direction ladder, preventing single-bar impulse breakouts from mislabelling.
- **Structure + Trigger design:** As of 2026-06-18, all entry signals require both a structural condition (trend alignment, above EMA200) and a trigger condition (breakout, bounce, compression). WATCH is a universe filter only and is not gate-evaluated.
- **Research phase:** Gates still building sample size with new label taxonomy. The app is a signal generator and backtesting workspace, not a validated trading system.
- **Safe-haven override:** GLD, IAU, SGOV, SHY, IEF, TLT, BIL, TIP are immune to regime downgrades in the ETF engine.
- **HYP-013 — D1 earnings contamination (confirmed bug):** `cronSnapshot.ts` backfill path calls `buildHistoricalSignals` without the `historicalEarningsMap` parameter, so all historical D1 signals have `earnings_in_window = false`. Approximately 11% of signals occur near earnings windows and are not flagged. Gate Summary statistics have a known optimistic bias until this is fixed. See `SIGNAL_IMPROVEMENT.md` HYP-013.
- **Market cap data:** `StockSnapshotEntry.marketCap` is only populated by GitHub Actions builds (via `scripts/yahooMarketCap.ts`). The on-demand Worker snapshot trigger lacks market cap data; the Sector Treemap gracefully degrades to equal-width tiles.

---

---

## 20. Architecture Status

| Phase | Status | Summary |
|---|---|---|
| B1 — KV + Cron | ✅ Complete (2026-06-19) | 299 stocks classified daily; KV snapshot; browser is pure renderer |
| B2 — D1 signals | ✅ Complete (2026-06-19) | Forward returns settled server-side; Verify tab reads D1; 2yr backfill done |
| Track B — FRED liquidity | ✅ Complete (2026-06-22) | `fredLiquidity.ts` → `LiquidityNote` in DailySnapshot; GH Actions verified |
| Track C — Sector Treemap | ✅ Complete (2026-06-22) | `SectorTreemap.tsx` Pro-only CSS flex treemap; `yahooMarketCap.ts` batch fetch |
| Track A — Python ML infra | ✅ Infrastructure done (2026-06-22) | `scripts/ml/`: fetch_signals.py + label.py (Triple-Barrier); sample volume already sufficient (~74k rows / ~14 months) |
| B3 — ML training | ⏳ Blocked on data quality | Sample count is NOT the blocker (~74k rows since 2025-04). Requires only: **HYP-013 earnings fix** + **HYP-015 universe snapshot** |

### Pre-conditions Before ML Training

Before running `scripts/ml/label.py` and training LightGBM:

1. **HYP-013 fix:** Add `earnings_calendar` D1 table; pass historical earnings map to `buildHistoricalSignals` in backfill path so ~11% of mislabeled signals are corrected.
2. **HYP-015:** Establish frozen monthly universe snapshots to eliminate selection bias in training data.

Until these are resolved, training data has known systematic biases that a stronger model will amplify rather than correct.

---

Last updated: 2026-06-22 (Track A+B+C complete; GH Actions primary pipeline; 299 stocks; FRED liquidity; Sector Treemap Pro; Python ML infra ready)
