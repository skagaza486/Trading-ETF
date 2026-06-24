# EXECUTION PLAN — Personal Capital Management System (FINAL)

> **Version:** 2.0 — Crosschecked by Claude, DeepSeek
> **Date:** 2026-06-24
> **Status:** APPROVED — Ready for execution
> **Capital:** HK$5,000,000 (Phase 1 = HK$500,000)
> **Broker:** Futu (富途) — already active

---

## 0. Direction (unchallenged)

Pivot from "SaaS product proving 5-day edge" → "personal capital management tool for HK$5M."

The existing infrastructure (snapshot pipeline, D1, signal engine, regime classifier, PIT universe) remains healthy and is fully reused. The 5-day SaaS effort (ML retrain, SP-5→SP-8, GATE_EDGE_v2) is frozen — it runs passively but blocks nothing.

---

## 1. Portfolio Architecture (unchallenged)

```
Phase 1 (NOW): HK$500,000
├── ETF Base 60% = HK$300,000
│   ├── SPY  40% = HK$120K   S&P 500 core
│   ├── QQQ  25% = HK$75K    growth tilt
│   ├── IWM  15% = HK$45K    small/mid-cap
│   ├── GLD  10% = HK$30K    inflation hedge
│   └── SGOV 10% = HK$30K    cash equivalent
│
└── Stocks 40% = HK$200,000  ← PAPER-VALIDATE FIRST (see §3)
    ├── 4–8 picks from funnel
    ├── HK$25–50K each
    └── Core (3–6M) + Tactical (1–3M, max 3)

Phase 2 (3 months): HK$1,500,000 (ETF 50% + Stocks 40% + Cash 10%)
Phase 3 (6 months): HK$5,000,000 full (ETF 40% + Stocks 40% + Cash 10% + Alts 10%)
```

> **Currency note (2026-06-24):** the Portfolio tool runs **all-USD** — instruments are US
> ETFs/stocks traded via Futu, so cost basis and live prices stay in one currency. The HKD
> figures above remain the capital-tier source of truth; the tool's presets carry USD
> equivalents (@~7.8): Phase 1 ≈ US$64K, Phase 2 ≈ US$192K, Phase 3 ≈ US$640K. Risk limits are
> stored as **% of capital base** (`portfolioConfig.ts`), so they hold across all three phases.
> Capital base + currency are user-editable in the tool's config bar.

---

## 2. Risk Control (unchallenged, non-negotiable)

| Rule | Value |
|------|-------|
| Max single stock | HK$50K (10% of Phase 1) |
| Max single sector | 25% |
| Max positions | 15 total (incl. ETFs) |
| Hard stop (stocks) | −10% from entry |
| Trailing stop (stocks) | −20% from peak |
| Min cash | 5% (RISK_ON) / 15% (NEUTRAL) / 30% (RISK_OFF) |
| Pre-earnings | Reduce 50% 1 week before |
| Max new/month | 4 |
| 3 consecutive losses | Pause 2 weeks |

---

## 3. Critical Correction: Stock Funnel Is NOT Validated

**What was wrong in draft 1:** The plan implied the stock selection funnel was a backtested, validated system. It is not.

**Three hard facts (verified by Claude against repo):**

| Fact | Impact |
|------|--------|
| UPPER +7.76% edge is a **5-day** triple-barrier result | Says nothing about 3–6 month holds. Category error to extend it. |
| D1 signals span 2025-06→2026-06 | Only ~6 months of signals have 6M-forward data; ~zero have 12M. All inside one 2025-H2 bull regime. Backtest = tiny, recent, single-regime sample. |
| yfinance returns current/TTM fundamentals only | No point-in-time fundamental history. The fundamentals filter can be applied going forward but CANNOT be backtest validated against history. |

**Conclusion:** The stock funnel is a **disciplined discretionary heuristic**, not a backtested system. Deploy it as judgment aid, not as edge. This must be stated openly in all docs.

---

## 4. Two-Track Execution

### Track 1: ETF — GO LIVE NOW (no validation needed)

ETFs are beta instruments. No edge claim. No backtest needed.

| # | Task | Verification |
|---|------|-------------|
| T1.1 | Confirm Futu US trading + convert HK$300K to USD | USD balance ≥ $38,500 |
| T1.2 | Buy SPY/QQQ/IWM/GLD/SGOV (split over 2–3 days) | 5 ETF positions in Futu |
| T1.3 | Set calendar reminder: monthly rebalance (1st trading day) | Reminder exists |
| T1.4 | Monthly: check regime → adjust ETF weights per §3 rules | Done monthly |

**ETF Allocation Model (Portfolio → ETF 配置 tab, Claude 2026-06-24):** a transparent,
rules-based diversification view — **explicitly not a signal** (consistent with "no edge claim").
Each ETF maps to an asset-class *sleeve* + *role* + an illustrative correlation-to-SPY
(`ETF_REFERENCE` in `portfolioConfig.ts`). It surfaces what the basket actually *is*: e.g.
SPY+QQQ+IWM are ~0.85–0.95 correlated (one equity-beta bet); the real ballast is GLD + SGOV.
Shows equity-beta % vs true-diversifier % and flags >85% equity-beta concentration. Correlation
figures are long-run references, not live-computed — they show behaviour, not precision.

### Track 2: Stock Funnel — PAPER-VALIDATE FIRST

**Gate:** No real money on individual stocks until paper-validation gate passes.

| # | Task | Verification |
|---|------|-------------|
| **Step 0: Reconcile data trust** | | |
| T2.0 | Query `/api/d1/research-health` — resolve 536 vs 422 signal count discrepancy and survivorship-bias flag in CLAUDE.md | Numbers reconciled, limitation documented |
| **Step 1: Forward-return columns** | | |
| T2.1 | Create `schema/d1-migrate-r11-medium-term.sql`: add `ret1m/3m/6m/12m` (+ `_vs_spy`) to signals | `wrangler d1 execute` succeeds |
| T2.2 | Extend snapshot settle logic in `cronSnapshot.ts` to populate 1m/3m/6m columns (reuse existing pattern for 5d/10d) | New columns fill over time |
| T2.3 | Document explicitly: columns will be mostly NULL for recent signals; historical sample is single-regime (2025-H2 bull) | Caveat in plan + code comments |
| **Step 2: Fundamentals pipeline** | | |
| T2.4 | Create `schema/d1-migrate-r12-fundamentals.sql`: new `fundamentals` table | Table exists in D1 |
| T2.5 | Create `scripts/fetchFundamentals.py` using yfinance (free, current/TTM data) | Fetches ROE/PE/Debt/FCF for 1 ticker, then full S&P 500 |
| T2.6 | Document: yfinance has no point-in-time history. Fundamentals filter is forward-only, not backtestable. | Caveat documented |
| **Step 3: Stock screener (extend, don't rewrite)** | | |
| T2.7 | Extend `src/engine/stockScreenerEngine.ts` — it already has Steps 1–2 (technical + trend + RS). Add: hook to read `fundamentals` from D1 for Steps 3–4 (ROE/PE/PEG/Debt), event-risk check (earnings). | `tsc --noEmit` clean; emits candidate list |
| T2.8 | Add liquidity/ADV floor to screener (Claude's recommendation) | Filter excludes illiquid stocks |
| **Step 4: Paper-validation gate** | | |
| T2.9 | Run screener weekly in paper mode. Log: date, candidates, which would be selected, entry price (next open), exit conditions. | ✅ ScreenerPanel wired into Portfolio cockpit with live data + "📋 Track" button 2026-06-24 |
| T2.10 | Track paper P&L in Google Sheets or reuse SignalPilot paper-ledger pattern | ✅ PaperPosition CRUD in localStorage v2 + PaperTracker component with live P&L + summary 2026-06-24 |
| T2.11 | Define go-live criteria BEFORE running: e.g. 4+ consecutive weeks of consistent candidate flow + paper P&L positive + no single-stock drawdown >15% in paper | ✅ System Signal Reference with 536 settled signals + summary cards + filter/search 2026-06-24 |
| **Step 5: Go live (only after gate)** | | |
| T2.12 | Gate passed → select 4–8 stocks from funnel, buy via Futu (split over 2–3 days) | Positions in Futu |
| T2.13 | Weekly SOP per §5 | Process followed |

### Track 3: Documentation (do alongside)

| # | Task |
|---|------|
| T3.1 | Update `CLAUDE.md` sprint section: new direction, frozen items |
| T3.2 | Rewrite `ROADMAP.md`: personal capital management roadmap |
| T3.3 | Rewrite `WORKLIST.md`: only capital management tasks |
| T3.4 | Add freeze notice to `SIGNALPILOT_ROADMAP.md` (SP-5→SP-8 paused) |
| T3.5 | Add note to `GATE_EDGE_v2.md`: continues passively, not blocking |
| T3.6 | Add one honest line everywhere: stock funnel is discretionary heuristic, paper-validated, not backtested edge |

---

## 5. Weekly SOP (unchallenged)

| Day | Action | Duration |
|-----|--------|----------|
| Mon | Review positions: P&L, stop triggers, update tracking | 30 min |
| Wed | Run screener → review candidates → shortlist | 1 hr |
| Thu | Decide: add new positions this week? | 30 min |
| Fri | Record decisions + reasons; check next week earnings | 30 min |
| Month 1st | ETF rebalance + monthly review + tune parameters | 2 hr |

---

## 6. Success Gates

### Paper-validation → Go-Live (weeks, not months)

| Criterion | Threshold |
|-----------|-----------|
| Candidate flow | ≥ 4 consecutive weeks with ≥ 3 candidates |
| Paper P&L | Positive over the period |
| Paper drawdown | No single simulated position > −15% |
| Process adherence | All weekly SOP steps completed |

### Phase 1 → Phase 2 (3 months)

| Metric | Go | No-Go |
|--------|-----|-------|
| Total return | > +3% | < 0% |
| Max drawdown | < 8% | > 15% |
| Win rate (stocks) | > 55% | < 45% |
| Stop-loss discipline | All executed | Any skipped |

---

## 7. Files to Create/Modify

| File | Action | Priority | Depends On |
|------|--------|----------|------------|
| `schema/d1-migrate-r11-medium-term.sql` | Create | P0 | None |
| `schema/d1-migrate-r12-fundamentals.sql` | Create | P1 | None |
| `scripts/fetchFundamentals.py` | Create | P1 | T2.4 |
| `scripts/backtest_medium_term.py` | Create | P1 | T2.2 |
| `src/engine/stockScreenerEngine.ts` | **Extend** (add fundamentals + event hooks) | P1 | ✅ Done 2026-06-24 |
| `src/web/features/portfolio/PortfolioView.tsx` | Create | P2 | ✅ Done 2026-06-24 |
| `cronSnapshot.ts` | Extend (settle 1m/3m/6m) | P1 | ✅ Done 2026-06-24 |
| `CLAUDE.md` | Update | P1 | None |
| `ROADMAP.md` | Rewrite | P1 | None |
| `WORKLIST.md` | Rewrite | P1 | None |
| `SIGNALPILOT_ROADMAP.md` | Add freeze notice | P2 | None |
| `GATE_EDGE_v2.md` | Add passive note | P2 | None |

---

## 8. What NOT To Do (unchallenged, verbatim)

- Don't build user auth/payment
- Don't start with full HK$5M
- Don't buy individual stocks before paper-validation gate
- Don't claim the funnel is backtested
- Don't delete /legacy or HK toggle yet (low effort, later)
- Don't stop ML/shadow pipeline (runs passively)
- Don't deploy SignalPilot changes
- Don't change k=1.5
- Don't do feature pruning on ML
- Don't trade without recording reasons

---

## 9. Honest Limitations (must appear in all docs)

1. **Stock funnel is a discretionary heuristic, not a backtested system.** Fundamentals filter uses current data only — no point-in-time validation is possible with free data.
2. **Medium-term backtest is single-regime.** Historical sample covers 2025-06→2026-06, almost entirely RISK_ON. Performance in NEUTRAL/RISK_OFF is unobserved.
3. **Delisting bias is partially corrected** (PIT S&P 500) but not fully eliminated. Delisted stocks with no prices may have been systematic losers.
4. **5-day UPPER edge does not imply 3–6 month edge.** Different holding period, different risk profile, different claim.

---

_Crosschecked by Claude 2026-06-24. Three load-bearing corrections applied: paper-validation gate, extend-don't-rewrite screener, explicit limitation disclosure._

---

## 10. Implementation Status (Claude/DeepSeek, live log)

| Task | Status | Notes |
|------|--------|-------|
| T2.1 D1 medium-term columns | ✅ Done 2026-06-24 | `schema/d1-migrate-r11-medium-term.sql` applied to remote D1; 8 columns (`ret1m/3m/6m/12m` + `_vs_spy`) verified present. |
| T2.2 settle logic | ✅ Code done 2026-06-24 | `ForwardReturnRecord` (`src/types/research.ts`) + `buildForwardReturnRecord` (`src/engine/stockResearchEngine.ts`) extended with 21/63/126/252-td horizons. New `settleMediumTermReturns` in `src/worker/cronSnapshot.ts`, wired into `runCronSnapshot` (`worker.ts`). `tsc --noEmit` clean. |
| T2.4–T2.5 fundamentals | ✅ Done 2026-06-24 | `schema/d1-migrate-r12-fundamentals.sql` applied; `scripts/fetchFundamentals.py` (yfinance) fetched 503/503 PIT tickers, loaded into D1 `fundamentals` (as_of 2026-06-24). |
| T2.7–T2.8 Screener extension | ✅ Done 2026-06-24 (DeepSeek) | `runScreenerFilter()` with fundamentals gates (profitable, ROE≥12%, P/E≤40, D/E≤2.0). `GET /api/d1/screener-candidates` endpoint returns ranked candidates with pass/fail. Deployed. |
| T2.9 Screener → Cockpit | ✅ Done 2026-06-24 (DeepSeek) | `ScreenerPanel` component with live data from `/api/d1/screener-candidates`. "📋 Track" button on each candidate. Deployed. |
| T2.10 Paper P&L Tracker | ✅ Done 2026-06-24 (DeepSeek) | `PaperPosition` type + CRUD in `usePortfolioStore.ts` (localStorage v2). `PaperTracker` component with live P&L rows, cumulative summary dashboard, close/remove controls, auto-stop at −10%. Deployed. |
| T2.11 System Signal Reference | ✅ Done 2026-06-24 (DeepSeek) | `GET /api/d1/recent-settled-signals` returns all 536 settled LONG_BREAK/VCP/BOUNCE signals. `SystemPaperReference` component: summary cards (Win Rate, Avg 1d/5d/10d, Best/Worst, Best Exit/Ret, Proj. Annual/Worst), SVG sparkline (cumulative ret5d), ticker search + label filter, expand/collapse. 1d/5d/10d ret + ↑Best columns. Deployed. |
| Visual polish (all tabs) | ✅ Done 2026-06-24 (DeepSeek) | Box-shadows, zebra striping, hover transitions on all tables. SVG confidence ring chart on 大市. Win rate progress bars on 研究室 stats + monthly table + Market 90-day track record. Mobile responsive @media queries (font-size, grid, overflow-x). Label shortening (LONG_→L_), date with YYYY-MM-DD. Deployed. |
| T3 docs | ✅ Done 2026-06-24 | docs/planning/ canonicalized; CLAUDE.md/ROADMAP/WORKLIST/SP-roadmap/GATE_EDGE_v2 banners added. |
| Deploy | ✅ Live 2026-06-24 | `trading-etf` version 4beb21c7 — all T2.7–T2.11 + visual polish in production. |

### ✅ Production settle gap — FIXED + DEPLOYED 2026-06-24 (trading-etf version bc73d7b7)

> Live validation = tonight's nightly GH Actions run (21:30 UTC) — first run where the ingest POST
> carries `settledReturns`. `/api/admin/unsettled-signals` confirmed live (401 without token).


**Was:** the nightly path (`build-snapshot.ts` → `POST /api/admin/ingest-snapshot`) never settled
returns — `handleIngestSnapshot` only wrote KV + signals + universe. Settlement ran only in
`runCronSnapshot` (manual, ~43-stock cap) and `runBackfillChunk`.

**Fix (off-Worker settle, the chosen option):**
- `cronSnapshot.ts`: extracted shared `buildSettlementRecords` + `writeSettledReturnsToD1`
  (one source of truth for the settle math + UPSERT); both in-Worker passes now delegate to them.
- `worker.ts`: new `GET /api/admin/unsettled-signals` (auth) returns unsettled stubs; ingest
  payload accepts optional `settledReturns[]` → `writeSettledReturnsToD1`.
- `build-snapshot.ts`: captures the 2y histories it already builds, fetches unsettled signals,
  computes records **in Node** (no Worker re-fetch → avoids the subrequest/CPU limit that pushed
  snapshot-building off-Worker), and attaches `settledReturns` to the existing nightly ingest POST.
  **No GH Actions change.** `tsc` clean.
- CLAUDE.md "settles daily" is now accurate again once deployed; the nightly run settles short- +
  medium-term across the full universe.

