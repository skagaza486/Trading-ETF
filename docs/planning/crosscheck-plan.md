# Crosscheck Plan: Personal Capital Management System

> **Status:** PENDING CROSSCHECK — 待其他 AI 審查後決定是否執行
> **Created:** 2026-06-24
> **Purpose:** 將 Trading ETF repo 從「SaaS 產品研發」轉向「個人資本管理工具」
> **Capital:** HK$5,000,000（Phase 1 起步 HK$500,000）
> **Broker:** 富途（已開戶）

---

## 0. Current State（執行前現狀）

### 0.1 已運行的系統（不需改動）

| System | Status | What It Does |
|--------|--------|--------------|
| `snapshot.yml` (GH Actions, 21:30 UTC Mon–Fri) | ✅ Running | Daily: fetch ~294 stocks → KV snapshot + D1 signals + settle forward returns |
| `signalpilot-daily.yml` | ✅ Running | Daily: SP-2 batch + SP-4 shadow inference (runs after snapshot) |
| D1 `trading-etf-db` | ✅ Active | `signals` table: 536 eligible PIT signals (2025-06→2026-06-05), NEUTRAL+other labels |
| PIT S&P 500 universe | ✅ Active | `pit_sp500_snapshots.json`, 528 tickers, 15 months coverage |
| Market regime engine | ✅ Active | `src/engine/marketRegime.ts`: RISK_ON/NEUTRAL/RISK_OFF from VIX+SPY+QQQ |
| Signal engine | ✅ Active | `src/engine/signalClassifier.ts`: LONG_BREAK/VCP/BOUNCE classification |
| Web UI | ✅ Deployed | `trading-etf.skagaza486.workers.dev`, 5-tab UI 2.0 |
| SignalPilot SP-0→SP-4 | ✅ Deployed | `signalpilot.skagaza486.workers.dev`, paper ledger + shadow inference |

### 0.2 已完成的關鍵分析

| Analysis | Result |
|----------|--------|
| UPPER label edge | ✅ Significant: train/val n=145 mean=+5.25% p=0.0000; holdout n=28 mean=+7.76% p=0.0000 |
| Delisting bias impact | ✅ Not invalidating: worst case −29bps on overall mean |
| ML v1.0.2 status | Fold 4 AUC=0.425 < 0.50 (unstable, needs more data) |
| Eligible signal rate | ~16/month post-PIT-filter |

### 0.3 現有系統的限制

| Limitation | Detail |
|------------|--------|
| Forward returns only 1d–10d | No 1-month, 3-month, 6-month, 12-month columns |
| No fundamental data | No ROE, P/E, earnings growth, debt ratios in D1 |
| No position tracking | SignalPilot SP-2 is paper only, not connected to real brokerage |
| 5-day holding focus | Entire ML + gate framework designed for 5-day horizon |

---

## 1. Direction Change

### 1.1 舊方向 → 新方向

| Dimension | Old (SaaS Product) | New (Personal Capital Mgmt) |
|-----------|--------------------|-----------------------------|
| Goal | Prove 5-day edge → sell to users | Generate stable medium-term returns for HK$5M |
| Time horizon | 5 trading days | 1–12 months |
| Stock selection | Rule signals only | Technical + fundamental + valuation 3-layer funnel |
| ML role | Core: predict triple-barrier label | Reduced: not used for decisions |
| User | Future paying subscribers | Self (personal account) |
| Execution | SP-5→SP-8 automated trading | Manual via Futu (富途) |
| Monetization | SaaS subscriptions | Portfolio returns |

### 1.2 What stays unchanged

- Daily snapshot pipeline (GH Actions → KV + D1)
- Signal engine (LONG_BREAK/VCP/BOUNCE classification)
- Market regime (RISK_ON/NEUTRAL/RISK_OFF)
- PIT S&P 500 universe
- D1 infrastructure
- Yahoo data proxy
- TypeScript type system

### 1.3 What gets frozen (continue running, not actively developed)

- ML v1.0.3 retrain (wait for natural data accumulation)
- SP-4 shadow inference (runs nightly, not used for decisions)
- GATE_EDGE_v2 5-day version (wait for n≥100)
- SignalPilot SP-5→SP-8 (indefinitely paused)
- All SaaS/UI-for-strangers features

### 1.4 What gets built new

- D1 columns: `ret1m`, `ret3m`, `ret6m`, `ret12m` (+ vs SPY variants)
- D1 table: `fundamentals` (ROE, P/E, PEG, debt/equity, revenue/earnings growth, FCF)
- `scripts/backtest_medium_term.py`: 3M/6M holding period return analysis
- `scripts/fetchFundamentals.py`: yfinance-based fundamental data ingestion
- `scripts/stock_screener.py`: multi-layer stock selection funnel
- `src/web/features/portfolio/`: position monitoring dashboard UI
- Google Sheets tracking template for manual position journal

---

## 2. Portfolio Architecture

### 2.1 Three-Tier Structure

```
HK$5,000,000 total (phased deployment)
│
├── Phase 1 (NOW): HK$500,000 live
│   ├── Tier 1: ETF Base (60% = HK$300,000)
│   │   ├── SPY  40% = HK$120,000  (S&P 500 core)
│   │   ├── QQQ  25% = HK$75,000   (growth tilt)
│   │   ├── IWM  15% = HK$45,000   (small/mid-cap)
│   │   ├── GLD  10% = HK$30,000   (inflation hedge)
│   │   └── SGOV 10% = HK$30,000   (cash equivalent)
│   │
│   └── Tier 2+3: Individual Stocks (40% = HK$200,000)
│       ├── 4–8 stocks selected via funnel (§4)
│       ├── HK$25,000–50,000 per position
│       └── Tier 2: core (3–6 month hold)
│           Tier 3: tactical (1–3 month hold, max 3 positions)
│
├── Phase 2 (3 months later): HK$1,500,000
│   └── ETF 50% + Stocks 40% + Cash 10%
│
└── Phase 3 (6 months later): HK$5,000,000 full
    └── ETF 40% + Stocks 40% + Cash 10% + Alternatives 10%
```

### 2.2 Holding Periods by Tier

| Tier | Horizon | Entry Signal | Exit Conditions | Position Size |
|------|---------|-------------|-----------------|---------------|
| **1 ETF** | 6–12 months | Regime-based monthly rebalance | Regime shift to RISK_OFF | 60% total |
| **2 Core** | 3–6 months | Signal + fundamentals + valuation all pass | Any condition fails OR 6-month expiry | HK$25–50K each |
| **3 Tactical** | 1–3 months | LONG_BREAK or LONG_VCP + simplified checks | +15% take profit / −8% stop / 3-month expiry | HK$20–30K each, max 3 |

---

## 3. ETF Operation Rules

| Rule | Detail |
|------|--------|
| Rebalance | First trading day of each month |
| RISK_ON | Standard allocation (as in §2.1) |
| NEUTRAL | ETF allocation reduced to 80% of standard |
| RISK_OFF | SPY/QQQ halved; SGOV raised to 40% |
| No tactical ETF trading | ETFs are for beta, not alpha |
| Dividend handling | Reinvest into SGOV, rebalance next month |

---

## 4. Stock Selection Funnel

### 4.1 Full Funnel (for Tier 2 Core Positions)

```
Step 0: Universe
    PIT S&P 500 members (from pit_sp500_snapshots.json, ~500 tickers)

Step 1: Technical (existing ✅)
    LONG_BREAK, LONG_VCP, or LONG_BOUNCE signal in last 4 weeks
    → Emitted by existing signalClassifier, stored in D1 signals table

Step 2: Trend Structure (existing ✅)
    EMA50 > EMA150 (multi-timeframe alignment)
    RSI between 50–70 (trending, not overbought)

Step 3: Fundamentals (NEW — yfinance integration)
    ROE > 15%
    Revenue YoY growth > 5%
    Earnings YoY growth > 10%
    Debt/Equity < 1.5 (< 2.0 for Technology sector)
    Free Cash Flow > 0

Step 4: Valuation (NEW)
    P/E < sector average + 1 standard deviation
    PEG ratio < 2.0
    Not an unprofitable "story stock" (must have positive earnings)

Step 5: Event Risk
    No earnings report in next 2 weeks
    earnings_in_window = 0 (from D1)

Step 6: Macro Confirmation (existing ✅)
    regime != RISK_OFF
    FRED liquidity no warning (if available)

Output: Ranked Top 10 candidates
    Sort: signal strength × fundamental quality score
```

### 4.2 Simplified Funnel (for Tier 3 Tactical)

Same as above but:
- Only LONG_BREAK + LONG_VCP signals
- Fundamentals simplified: PE < 50 AND earnings > 0 AND no earnings in 2 weeks
- RS line at new high + volume confirmation

---

## 5. Risk Control Rules (Non-Negotiable)

| Rule | Value |
|------|-------|
| Max single stock position | HK$50,000 (10% of Phase 1 capital) |
| Max single sector | 25% |
| Max total positions | 15 (including ETFs) |
| Hard stop-loss (stocks) | −10% from entry price |
| Trailing stop (stocks) | −20% from peak price |
| Minimum cash | 5% (RISK_ON) / 15% (NEUTRAL) / 30% (RISK_OFF) |
| Pre-earnings | Reduce 50% 1 week before; re-evaluate 3 days after |
| Max new positions/month | 4 |
| Consecutive losses | 3 losses → pause new entries 2 weeks |

---

## 6. Implementation Plan

### Phase A: Foundation (Week 1, 2026-06-23 to 06-27)

**Goal:** ETFs bought, D1 extended, backtest run

| # | Task | Dependencies | Verification |
|---|------|-------------|--------------|
| A1 | Confirm Futu US stock trading enabled | None | Can place US order in Futu app |
| A2 | Convert HKD→USD in Futu (HK$300K worth) | A1 | USD balance ≥ $38,500 |
| A3 | Buy ETF basket: SPY/QQQ/IWM/GLD/SGOV | A2 | 5 ETF positions visible in Futu |
| A4 | Create `schema/d1-migrate-r11-medium-term.sql` | None | File exists, valid SQL |
| A5 | Execute D1 migration (add 1M/3M/6M/12M columns) | A4 | `wrangler d1 execute` succeeds, columns appear |
| A6 | Create `scripts/backtest_medium_term.py` | A5 | Script runs without error |
| A7 | Run backtest: 3M/6M holding returns by label, regime | A6 | Output: mean return, win rate, max drawdown by slice |

### Phase B: Fundamentals (Week 2–3, 2026-06-30 to 07-11)

**Goal:** Fundamental data pipeline running, stock screener producing candidates

| # | Task | Dependencies | Verification |
|---|------|-------------|--------------|
| B1 | Create `schema/d1-migrate-r12-fundamentals.sql` | None | File exists |
| B2 | Execute D1 migration (create `fundamentals` table) | B1 | Table exists in D1 |
| B3 | Create `scripts/fetchFundamentals.py` (yfinance free) | B2 | Script fetches ROE/PE/debt for 1 ticker |
| B4 | Run for all S&P 500 tickers (~500) | B3 | `fundamentals` table populated |
| B5 | Create `scripts/stock_screener.py` (funnel §4) | B4, A7 | Script outputs ranked candidate list |
| B6 | Run screener: generate first Top 10 | B5 | 10 candidates with scores |

### Phase C: First Live Stock Positions (Week 4, 2026-07-14 to 07-18)

**Goal:** First batch of individual stocks bought and tracked

| # | Task | Dependencies | Verification |
|---|------|-------------|--------------|
| C1 | Review Top 10, manually verify 4–8 picks | B6 | Final selection documented with reasons |
| C2 | Buy stocks via Futu (split over 2–3 days) | C1, A2 | 4–8 stock positions in Futu |
| C3 | Create Google Sheets tracking template | C1 | Template with all tracking columns |
| C4 | Record all positions in tracking sheet | C2, C3 | All entries complete |

### Phase D: Systematize (Month 2–3, 2026-08 to 09)

**Goal:** Automated weekly reports, portfolio dashboard, process refinement

| # | Task | Dependencies | Verification |
|---|------|-------------|--------------|
| D1 | Create `src/web/features/portfolio/PortfolioView.tsx` | C4 | New tab in UI showing positions, P&L, risk |
| D2 | Automate weekly screener run | B5 | Script produces weekly report without manual steps |
| D3 | Month 1 review: adjust parameters | C4 | Updated rules documented |
| D4 | Phase 2 decision: Go/No-Go to HK$1.5M | D3 | Explicit Go/No-Go with reasons |

---

## 7. Weekly Operating Procedure

| Day | Action | Duration |
|-----|--------|----------|
| **Monday** | Review all positions: P&L, stop-loss triggers, update tracking sheet | 30 min |
| **Wednesday** | Run stock screener → review candidate list → shortlist | 1 hr |
| **Thursday** | Finalize: add new positions this week? If yes, plan entry | 30 min |
| **Friday** | Record all decisions + reasons; check next week's earnings calendar | 30 min |
| **Month 1st** | ETF rebalance + monthly review + parameter tuning | 2 hr |

---

## 8. Success Criteria & Go/No-Go Gates

### 8.1 Phase 1 → Phase 2 Go/No-Go (3 months)

| Metric | Go Threshold | No-Go Threshold |
|--------|-------------|-----------------|
| Total return | > +3% | < 0% |
| Max drawdown | < 8% | > 15% |
| Win rate (stocks) | > 55% | < 45% |
| Sharpe (rolling 3M) | > 1.0 | < 0.3 |
| Stop-loss discipline | All stops executed | Any stop skipped |
| Funnel stability | Consistent candidates | No candidates for 2+ weeks |

### 8.2 Annual Targets

| Metric | Target | Minimum |
|--------|--------|---------|
| Annual return | 10–15% | > 6% |
| Max drawdown (annual) | < 12% | < 20% |
| Sharpe ratio | > 1.0 | > 0.5 |

---

## 9. Files to Create

| File | Purpose | Priority | Depends On |
|------|---------|----------|------------|
| `schema/d1-migrate-r11-medium-term.sql` | Add ret1m/3m/6m/12m columns to signals | P0 | None |
| `scripts/backtest_medium_term.py` | 3M/6M holding return analysis | P0 | D1 migration |
| `schema/d1-migrate-r12-fundamentals.sql` | Create fundamentals table | P1 | None |
| `scripts/fetchFundamentals.py` | yfinance fundamental data ingestion | P1 | D1 migration |
| `scripts/stock_screener.py` | Multi-layer stock selection funnel | P1 | Backtest + fundamentals |
| `src/web/features/portfolio/PortfolioView.tsx` | Position monitoring dashboard | P2 | First positions established |
| Google Sheets tracking template | Manual position journal | P1 | None |

---

## 10. Repo Document Updates Required

| Document | Action |
|----------|--------|
| `CLAUDE.md` | Update sprint section: new direction, frozen items |
| `ROADMAP.md` | Rewrite: personal capital management roadmap |
| `WORKLIST.md` | Rewrite: only capital management tasks |
| `SIGNALPILOT_ROADMAP.md` | Add freeze notice: SP-5→SP-8 paused |
| `GATE_EDGE_v2.md` | Add note: continues passively, not blocking |

---

## 11. What NOT To Do

| Don't | Why |
|-------|-----|
| Don't build user auth/payment | Not building SaaS |
| Don't remove HK stock toggle from UI yet | Low effort, do later |
| Don't delete /legacy code | Low effort, do later |
| Don't stop ML/shadow pipeline | Runs passively, costs nothing |
| Don't deploy SignalPilot changes | SP-0→SP-4 stable, don't touch |
| Don't change k=1.5 triple-barrier | Already validated |
| Don't do feature pruning on ML | EXPERIMENT_LOG shows it hurts AUC |
| Don't start with full HK$5M | Phase 1 = HK$500K only |
| Don't trade without writing down reasons | Process discipline > prediction accuracy |

---

## 12. Cross-Check Questions for the Other AI

1. Does the 3-tier portfolio structure (ETF 60% + Core 25% + Tactical 15%) make sense for a HK$5M medium-risk mandate?
2. Is the stock selection funnel complete? What's missing?
3. Are the risk control limits appropriate for HK$500K Phase 1?
4. Is yfinance reliable enough for fundamental data, or should we recommend a paid source from day 1?
5. Should we settle forward returns for 1M/3M/6M in D1 (like we do for 5d/10d), or compute them in Python on-demand?
6. The existing LONG_BREAK n=31, LONG_VCP n=103, LONG_BOUNCE n=402 — with the fundamental filter applied, will we have enough candidates?
7. Should GLD and SGOV be bought as US-listed ETFs (via Futu US trading) or HK-listed equivalents?
8. Is the weekly rhythm (2.5 hrs/week) realistic for a single person managing this?

---

_End of crosscheck plan._
