# Multi-AI Collaboration Workflow

> **Version:** 1.0  
> **Date:** 2026-06-24  
> **Purpose:** Define how multiple AIs (Claude, DeepSeek, and any future Copilot/GPT) collaborate on the Trading ETF repo without stepping on each other.

---

## 0. Principle

**One repo. Multiple AIs. Zero conflicts.**

Each AI has a defined scope. No AI touches another's files without explicit handoff. All plans are written to `/memories/repo/` as shared state. AIs read before acting.

---

## 1. Repo Zones (who owns what)

### Zone A: Core Infrastructure (shared, read-only for most)

```
src/engine/signalClassifier.ts
src/engine/indicatorEngine.ts
src/engine/marketRegime.ts
src/engine/stockScreenerEngine.ts
src/engine/historyUtils.ts
src/types/
worker.ts
wrangler.toml
vite.config.ts
```

**Rule:** Any AI can READ these. Only the designated AI modifies them during their assigned task window. After modification: `tsc --noEmit` must pass.

### Zone B: Data Pipeline (Claude primary)

```
schema/d1-migrate-r11-medium-term.sql
schema/d1-migrate-r12-fundamentals.sql
cronSnapshot.ts (settle path extension)
scripts/fetchFundamentals.py
scripts/build-snapshot.ts
```

**Rule:** Claude owns schema + D1 pipeline changes. Other AIs can propose via `/memories/repo/` plan files.

### Zone C: Analysis Scripts (DeepSeek primary)

```
scripts/backtest_medium_term.py
scripts/stable_returns_assessment.py
scripts/ml/gate_edge.py
models/
```

**Rule:** DeepSeek owns analysis scripts. Claude can crosscheck results.

### Zone D: UI & Frontend (either AI, coordinated)

```
src/web/features/portfolio/PortfolioView.tsx
src/web/app/
src/web/shared/
```

**Rule:** Declare intent in `/memories/repo/` before touching. Only one AI modifies UI at a time.

### Zone E: SignalPilot (frozen — no AI touches)

```
signalpilot/
wrangler.signalpilot.toml
scripts/trading/
```

**Rule:** SignalPilot SP-0→SP-4 runs passively. No changes unless explicit unfreeze decision recorded in `/memories/repo/`.

### Zone F: ML Pipeline (frozen — runs passively)

```
scripts/ml/train_lgbm.py
scripts/ml/label.py
scripts/ml/build_features.py
scripts/ml/evaluate.py
scripts/ml/shadow_inference.py
```

**Rule:** ML pipeline continues nightly via GH Actions. No retrain until natural data accumulation reaches trigger point (documented in `EXECUTION_PLAN.md`).

### Zone G: Shared State (all AIs read before acting)

```
/memories/repo/EXECUTION_PLAN.md       ← Single source of truth
/memories/repo/crosscheck-plan.md      ← Draft 1 + Claude's review
/memories/repo/long-term-plan.md       ← Deprecated (replaced by EXECUTION_PLAN.md)
CLAUDE.md                              ← Environment + sprint status
```

**Rule:** ALL AIs must read `EXECUTION_PLAN.md` and `CLAUDE.md` before any action.

---

## 2. Task Assignment Matrix

| Task (from EXECUTION_PLAN.md) | Primary AI | Reviewer AI | Status |
|------|------------|-------------|--------|
| T1.1–T1.4 ETF execution | User (manual, Futu) | — | User action |
| T2.0 Data reconciliation | DeepSeek | Claude | ✅ Done 2026-06-24 — queried `/api/d1/research-health` + D1 directly. 536 eligible (was 422), 100,582 settled, 3.16% earnings ratio. PIT universe verified (565–568 tickers/month, real variation). HYP-015 resolved. CLAUDE.md key data health section updated. |
| T2.1–T2.2 D1 columns + settle logic | Claude | DeepSeek | ✅ Done 2026-06-24 (not deployed; settle-gap → EXECUTION_PLAN §10) |
| T2.4–T2.5 Fundamentals table + script | Claude | DeepSeek | In progress (Claude) |
| T2.7–T2.8 Extend stockScreenerEngine.ts | **DeepSeek** | Claude | ✅ Done 2026-06-24 — Added `runScreenerFilter()` with fundamentals gates (profitable, ROE≥12%, P/E≤40, D/E≤2.0). Added `GET /api/d1/screener-candidates` endpoint that reads snapshot KV + fundamentals D1 and returns ranked candidates. 503 fundamentals records covering the S&P 500 universe. Currently 2 candidates (BIIB/WAT LONG_BOUNCE), both failing fundamentals gate — conservative by design. Deployed. |
| T2.9–T2.11 Paper-validation gate setup | DeepSeek | Claude | ✅ Done 2026-06-24 — Full paper-validation infrastructure deployed to `trading-etf`. **T2.9**: ScreenerPanel wired into Portfolio cockpit; `GET /api/d1/screener-candidates` returns live candidates with fundamentals pass/fail. **T2.10**: Paper P&L tracker built: `PaperPosition` type + CRUD in `usePortfolioStore.ts` (localStorage v2 with v1 migration); `PaperTracker` component with live P&L rows, cumulative summary (win rate, total P&L), close/remove controls; "📋 Track" button on each screener candidate; auto-stop at −10%. **T2.11**: System Signal Reference built: `GET /api/d1/recent-settled-signals` (all 536 settled signals from D1); `SystemPaperReference` component with summary stats (Win Rate, Avg 1d/5d/10d, Best/Worst, Best Exit, Proj Annual/Worst), SVG sparkline of cumulative ret5d, ticker search + label filter, expand/collapse (default 15, show all), 1d/5d/10d ret columns + ↑Best column, vs SPY hidden on mobile. Also: label shortening (LONG_→L_), date with year, confidence ring chart on 大市, win rate progress bars on 研究室 + Market 90-day track record, visual polish (shadows, zebra striping, hover transitions), mobile responsive @media queries. `tsc --noEmit` clean. Deployed. |
| T2.12 Go-live stock buys | User (manual, Futu) | — | Blocked by T2.11 |
| T3.1–T3.6 Documentation updates | Either | The other | ✅ Done 2026-06-24 (Claude — banners; full ROADMAP/WORKLIST rewrite deferred) |
| Portfolio UI (PortfolioView.tsx, Zone D) | **DeepSeek** | Claude | ✅ Done 2026-06-24 — Full portfolio cockpit built: `usePortfolioStore.ts` (localStorage v2 positions + journal + paper positions), `PortfolioView.tsx` (Dashboard: Regime, P&L, Allocation, Positions with live prices; Cockpit: Screener candidates, Trade Journal, Paper P&L Tracker, System Signal Reference). Deep visual polish: box-shadows, zebra striping, hover transitions, Win Rate progress bars, SVG confidence ring chart (大市), win rate bars (研究室), mobile responsive @media queries. `tsc --noEmit` clean. Deployed. |

---

## 3. Collaboration Protocol

### Before starting any task

1. Read `/memories/repo/EXECUTION_PLAN.md` — know the current state.
2. Read `CLAUDE.md` — know the environment (bundled node, wrangler paths, worker names).
3. Check if another AI has claimed the task (see §2 matrix — if status is "In Progress", do not touch).
4. If unclear: write a question to `/memories/repo/` as a note, wait for response.

### During a task

1. Update the task status in this file (or ask user to).
2. If you discover something that changes the plan: write it to `/memories/repo/` BEFORE acting.
3. After any code change: run `tsc --noEmit` (TypeScript) OR `python3 script.py --help` (Python) to verify.
4. After any D1 change: verify with `wrangler d1 execute ... --remote --command "SELECT ..."`.

### After a task

1. Update task status to "Done" with date.
2. If the task produced insights that affect other tasks: write a brief note to `/memories/repo/`.
3. If this was the last task in a track: run the verification step from `EXECUTION_PLAN.md`.

### Conflict resolution

If two AIs disagree on approach:
1. Each writes their position to `/memories/repo/disagreement-<topic>.md` (max 200 words each).
2. User decides. Decision recorded in `EXECUTION_PLAN.md`.

---

## 4. Communication Channels

| Channel | Format | When |
|---------|--------|------|
| `/memories/repo/` files | Markdown plans, notes, decisions | Async planning, handoffs |
| `CLAUDE.md` sprint section | Brief status lines | Current sprint state |
| Task matrix (§2) | Table with status | Who's doing what |
| Direct user conversation | Chat | Clarifications, approvals |

There is **no direct AI-to-AI communication**. All coordination happens through:
- Shared files in `/memories/repo/`
- The user as router

---

## 5. Weekly Sync (user-led)

Every Monday (or first trading day of the week):

1. User reviews all positions (ETF + stocks if live).
2. User reviews task matrix — what moved? what's blocked?
3. User assigns new tasks for the week by telling the relevant AI.
4. AI reads `EXECUTION_PLAN.md` + `CLAUDE.md` fresh before starting.

---

## 6. Environment Reference (for any AI)

```bash
# These are REQUIRED for all commands in this repo
alias node='.tools/node-v22.22.3-darwin-arm64/bin/node'
alias wrangler='node node_modules/.bin/wrangler'
alias tsc='node node_modules/.bin/tsc'
alias vite='node node_modules/.bin/vite'

# TypeScript check (must pass before any deploy or PR)
node node_modules/.bin/tsc --noEmit

# Build + deploy (ALWAYS together)
node node_modules/.bin/vite build && node node_modules/.bin/wrangler deploy

# D1 query (production)
node node_modules/.bin/wrangler d1 execute trading-etf-db --remote --command "SELECT ..."

# D1 migration
node node_modules/.bin/wrangler d1 execute trading-etf-db --remote --file=schema/xxx.sql

# Secrets
node node_modules/.bin/wrangler secret list
node node_modules/.bin/wrangler secret put <NAME>

# Targets
# Worker: trading-etf (hyphen) → https://trading-etf.skagaza486.workers.dev
# Worker: signalpilot → https://signalpilot.skagaza486.workers.dev
# KV: SNAPSHOT_KV (id: 98f886f9...)
# D1: trading_etf_db (id: 7a5b3490...)
# D1: signalpilot_db (id: 095a9cf7...)
```

---

## 7. Current Sprint Status (2026-06-24)

| What | Status |
|------|--------|
| ETF base position | **User action needed** — buy SPY/QQQ/IWM/GLD/SGOV via Futu |
| Data reconciliation (T2.0) | Not started — DeepSeek |
| D1 columns (T2.1–T2.2) | Not started — Claude |
| Fundamentals (T2.4–T2.5) | Not started — Claude |
| Stock screener (T2.7–T2.8) | Not started — either |
| Paper validation (T2.9–T2.11) | Not started — DeepSeek |
| Docs update (T3.1–T3.6) | Not started — either |
| ML retrain | Frozen — wait for data |
| SignalPilot SP-5+ | Frozen — indefinite |
| GATE_EDGE_v2 | Frozen — wait for n≥100 |

---

_This file is itself in Zone G (shared state). Any AI can propose changes; user approves._
