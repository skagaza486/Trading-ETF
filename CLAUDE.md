# Claude Code Instructions

## Runtime environment

This project is developed on **two machines** with different Node setups:

### Mac (darwin-arm64) — bundled Node v22
`node`, `npm`, and `npx` are NOT on the system PATH. Use the bundled binary:

```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/<tool>
```

Aliases:
```bash
alias node='.tools/node-v22.22.3-darwin-arm64/bin/node'
alias vite='node node_modules/.bin/vite'
alias wrangler='node node_modules/.bin/wrangler'
alias tsc='node node_modules/.bin/tsc'
```

### Windows PC — system Node v24 (installed via winget)
`node` and `npm` are on the system PATH (`C:\Program Files\nodejs`).
Run binaries directly — do **not** prefix with `node`:

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/vite build
node_modules/.bin/wrangler deploy
```

**npm on Windows requires the corporate proxy cert — always use:**
```bash
NODE_OPTIONS=--use-system-ca npm install
```

## TypeScript check

**Mac:** `.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/tsc --noEmit`  
**Windows:** `node_modules/.bin/tsc --noEmit`

Always run this before deploying. Zero errors required.

## Build + deploy (ALWAYS both together)

**Mac:**
```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/vite build && .tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler deploy
```

**Windows:**
```bash
node_modules/.bin/vite build && node_modules/.bin/wrangler deploy
```

**Never run `wrangler deploy` alone.** The Worker serves `dist/` as static assets — if you skip `vite build`, the deployed frontend will be stale.

## Target worker

- Worker name: `trading-etf` (with hyphen)
- URL: https://trading-etf.skagaza486.workers.dev
- KV binding: `SNAPSHOT_KV`
- D1 binding: `trading_etf_db` (database: `trading-etf-db`)
- Cron: **removed** from `wrangler.toml`. Daily snapshots run via GitHub Actions (`.github/workflows/snapshot.yml`, 21:30 UTC Mon–Fri = 90 min after US market close). `worker.ts` still has a `scheduled()` handler, but it never fires (no trigger configured).

There is an older worker named `tradingetf` (no hyphen) — **do not deploy to it**.

## SignalPilot worker

- Worker name: `signalpilot`
- URL: https://signalpilot.skagaza486.workers.dev
- Config: `wrangler.signalpilot.toml`
- D1 bindings: `trading_etf_db` (read-only) + `signalpilot_db` (read-write, id: `095a9cf7`)
- KV binding: `SP_CONTROL_KV` (id: `feedaa9c`)
- Auth: `SP_AUTH_TOKEN` secret (Bearer, constant-time compare, never log/commit)
- Deploy: `npm run sp:deploy` (typecheck → wrangler deploy --config wrangler.signalpilot.toml)

## D1 database operations

```bash
# Query — Mac
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler d1 execute trading-etf-db --remote --command "SELECT ..."
# Query — Windows
node_modules/.bin/wrangler d1 execute trading-etf-db --remote --command "SELECT ..."

# Run migration file — Mac
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler d1 execute trading-etf-db --remote --file=schema/some-migration.sql
# Run migration file — Windows
node_modules/.bin/wrangler d1 execute trading-etf-db --remote --file=schema/some-migration.sql
```

Always use `--remote` to target production D1. Omit it for local dev.

## Key architecture

- **Stocks tab**: reads from KV snapshot (`/api/snapshot/latest`) — pure renderer, no Yahoo fetch in browser
- **Verify/Quant Lab tab**: reads from D1 (`/api/d1/signals?days=365`) — no client-side replay
- **Daily snapshot** (GitHub Actions `snapshot.yml` → `scripts/build-snapshot.ts` → `POST /api/admin/ingest-snapshot`): writes KV snapshot + D1 signals + settles forward returns daily. The same logic lives in `cronSnapshot.ts` (`buildDailySnapshot`), but production runs it in GH Actions Node, not Worker cron.
- **Admin endpoints require `Bearer INGEST_TOKEN`**: `POST /api/admin/ingest-snapshot`, `GET /api/admin/backfill?offset=0`, `GET /api/admin/etf-backfill`, `POST /api/admin/run-snapshot`, `POST /api/admin/universe-snapshots`
- **Backfill endpoint**: `GET /api/admin/backfill?offset=0` — processes 30 stocks at a time for historical data population
- **Universe snapshot backfill**: `npm run research:backfill-universe -- --apply` — imports month snapshots from `git` history into D1 `watchlist_universe_snapshots`
- **Manual universe supplement**: use `docs/research/universe-snapshots.template.json` as the JSON shape for months missing from `git` history, then pass `--merge-file <path>` to `research:backfill-universe`
- **Research rebuild runner**: `npm run research:rebuild-data -- --universe-file <path>` — orchestrates universe snapshot import, historical signal chunk backfill, optional ETF backfill, then checks `/api/d1/research-health`
- **Research health endpoint**: `GET /api/d1/research-health` — aggregate counts for signals, earnings-window ratio, and universe-snapshot coverage
- **Manual snapshot trigger**: `POST /api/admin/run-snapshot` — runs the snapshot job on demand inside the Worker. ⚠️ A single Worker invocation caps at ~43 stocks (Yahoo rate-limits the Worker egress IP); `buildDailySnapshot` fetches the full ~299-stock universe at once, so the manual trigger returns a partial snapshot. For the full universe, rely on the nightly GitHub Actions run or chunk the builder like `runBackfillChunk`.

## 🚀 REVAMP (2026-06-25) — 新 app「Capital Manager」

> **任何 AI 進場前必讀：** [`docs/planning/REVAMP_PLAN.md`](docs/planning/REVAMP_PLAN.md)（唯一真相來源）
> 和 [`docs/ZONE_MAP.md`](docs/ZONE_MAP.md)（repo 分區地圖）。
> 以下為快速摘要；細節、phase 次序、DoD 全在 REVAMP_PLAN.md。

### 方向（一句話）

保留現有所有現狀，在同一 repo 起一個全新 app **Capital Manager** —— 兩個產品（ETF 自動配置 + 股票買賣策略），共用一條風險骨幹，研究訊號源只可「提議」，風險核心才能「裁決」，裁決路徑零 ML。

### Repo 分區（四態）

| Zone | 內容 | 規則 |
|---|---|---|
| 🟢 **LIVE-KEEP** | `trading-etf` worker · `snapshot.yml` | 必須留 live — 新 app 數據脊樑 |
| 🔵 **UN-LIVE** | `signalpilot` worker（已 undeploy）· `signalpilot-daily.yml`（dispatch-only）| 停運，code/D1 留 repo；`git checkout baseline/pre-revamp` 可復活 |
| 📦 **ARCHIVE** | `scripts/ml/` · `models/` · `GATE_EDGE*.md` | 純 code，不 live；ML 復活門檻見 REVAMP_PLAN §6 |
| ♻️ **SHARED LIB** | `src/engine/` · `src/types/` | 新 app 唯讀重用 |
| 🚀 **ACTIVE** | `capital/` worker · `src/capital-web/` · `capital-db` | 全新建設，所有工程在此 |

### Capital Manager 新 worker

- Worker name: `capital`（待建）
- Config: `wrangler.capital.toml`（待建）
- D1 — 讀訊號：唯讀綁定現有 `trading-etf-db`
- D1 — 真錢狀態：新 `capital-db`（positions / cash\_ledger / realized\_pnl / risk\_state / trade\_log）

### 當前 Phase（P0 — 架構與瘦身）✅

- [x] `git tag baseline/pre-revamp`
- [x] `REVAMP_PLAN.md` checked-in
- [x] `signalpilot` worker undeploy
- [x] `signalpilot-daily.yml` 改 dispatch-only
- [x] 全文件更新（CLAUDE.md / ROADMAP.md / WORKLIST.md / SIGNALPILOT_ROADMAP.md / ZONE_MAP.md）
- [ ] **下一 Phase = P1** — `capital-db` schema + `riskEngine.ts`（見 REVAMP_PLAN.md §4）

### 什麼不動

- `trading-etf` worker + `snapshot.yml` — 繼續 live，不改。
- `src/engine/`、`src/types/`、snapshot 管線 — 新 app 當 library 用，不複製不分叉。
- `signalpilot/` code、`signalpilot-daily.yml`、`models/`、`scripts/ml/` — code 留 repo，只是停運。

### 歷史背景（供參考）

以下「DIRECTION CHANGE (2026-06-24)」節為舊 personal capital management pivot 計劃紀錄，
已被 REVAMP_PLAN.md 取代。保留作背景，不再執行。

- **Frozen (run passively, not developed):** ML retrain, SignalPilot SP-5→SP-8, GATE_EDGE_v2.
- **Reused unchanged:** snapshot pipeline, D1, signal engine, regime, PIT universe.
- **Completed (T2.7–T2.11 by DeepSeek, 2026-06-24):** Screener extension → Portfolio cockpit → Paper
  P&L tracker → System Signal Reference → Visual polish across all tabs. Stock funnel is a
  **paper-validated discretionary heuristic, not a backtested edge** — see EXECUTION_PLAN §9 limitations.
- **Portfolio v2 refactor (Claude, 2026-06-24, deployed `trading-etf` version d0b354b8):**
  - **Tool / plan separation:** `src/web/features/portfolio/portfolioConfig.ts` — risk limits are now
    `% of capitalBase` (never absolute), and the personal 3-phase plan is DATA (`BUILTIN_PRESETS`),
    not logic baked into components. Store bumped to `portfolio_v3`; built-in presets auto-resolve
    from code on load (so preset edits propagate; only `custom` configs are kept verbatim).
  - **All-USD:** personal presets converted HKD→USD @~7.8 (Phase 1 US$64K / 2 US$192K / 3 US$640K);
    cost basis + Yahoo live price now share one currency.
  - **Sub-tabs:** `組合 | ETF 配置 | 計劃參考` inside the Portfolio view (no new bottom-nav item).
  - **ETF Allocation Model** (`ETF_REFERENCE` sleeve/role/corr table): transparent rules-based
    diversification view (sleeve grouping, equity-beta vs ballast %), explicitly **not a signal**.
  - Added the previously-unimplemented §2 single-sector 25% concentration alert.
  - ⚠️ Known-deferred (flagged, not fixed): intraday prevClose day-change bug, `:has-text()` crash in
    paper-tracker "Go to Screener", forward-looking "Proj. Annual" stat, journal has no realised P&L,
    no export/backup.
- **In progress (Claude):** fundamentals pipeline (T2.4–T2.5); medium-term return settlement
  (T2.2 — code done, pending GH Actions verification).
- The "Current sprint (5-day edge)" section below is **historical** — superseded by the pivot.

## 歷史紀錄 — 舊 sprint（2026-06-23，已被 REVAMP 取代）

> ⚠️ 以下為舊「SaaS 5 天 edge」方向的 sprint 紀錄。**不再執行。** 新工程看 REVAMP_PLAN.md。

**Context:** GPT is offline — Claude handles both `trading-etf` and SignalPilot lines.  
**If you are another AI reading this:** current direction is in [`docs/planning/REVAMP_PLAN.md`](docs/planning/REVAMP_PLAN.md) and [`docs/ZONE_MAP.md`](docs/ZONE_MAP.md). The notes below are historical context only.

### What's running autonomously (no action needed)

- `trading-etf` nightly snapshot: GH Actions `snapshot.yml` 21:30 UTC Mon–Fri ✅
- SignalPilot SP-2 nightly batch + SP-4 shadow inference: GH Actions `signalpilot-daily.yml` ⚠️ **FIXED 2026-06-24** — weekday `if` condition used `created_at` (ISO timestamp) instead of day name → always false → batch never ran since 2026-06-03. Fixed to `conclusion == 'success'` only. Will resume next trading day.

### What was completed (2026-06-23 full cycle)

- **P0 ✅**: earnings 3.12% verified (74,043 settled / 2,308 flagged)
- **P1 ✅ A-lite**: S&P 500 Wikipedia PIT universe built (`build_pit_sp500.py`); D1 injected; ~530-ticker 2y Yahoo backfill done; export + label re-run; research-health confirmed. ⚠️ delisting bias residual (no prices for SPLK/ATVI/FRC etc.)
- **P4 ✅**: holdout frozen — `data/holdout_freeze_v1.json` (n=75, 2026-02-01→2026-06-05, 20bps cost)
- **GATE-EDGE v1 ✅ executed, verdict = 🟡 ITERATE**: mean=+1.38% after cost, p=0.085 (α=0.05 not reached). UPPER-only BH-sig ✅ (+7.76%, n=28). LOWER labels drag (−5.37%, n=18). ML overlay failed (distribution shift, n_take=0). Full results: `models/gate_edge_result.json`, writeup: `GATE_EDGE.md` §12.
- **SP-2 ✅**: idempotency fix + 22-date historical backfill passed
- **SP-4 🟡**: pipeline promotes `model_v1.0.1_ef58f809`; shadow inference accumulating nightly. **Pipeline ≠ edge** — model on PIT data will need retraining (v1.0.2)

### Immediate next actions (ITERATE path)

> GATE-EDGE v1 = ITERATE. SP-5→SP-8 remain BLOCKED. Focus: understand *why* ITERATE and prepare v2.

1. **Investigate LOWER label drag** — n=18, mean=−5.37% is pulling primary mean down. Is k=1.5 barrier too narrow for 5d hold? Or should LOWER-type outcomes be excluded from the trading strategy entirely?
2. **Consider UPPER-only pre-registration for v2** — UPPER signals (n=28) are the only BH-significant slice. A strategy that only holds when triple-barrier predicts UPPER may be cleaner.
3. **Retrain ML v1.0.2 on PIT data** — v1.0.1 was trained on old biased universe; distribution shifted completely on holdout (n_take=0). Retrain after more PIT samples accumulate.
4. **Wait for 2026-08+ samples** — current holdout n=75 is borderline for n≥100 target. Let nightly inference accumulate ~1–2 more months before GATE_EDGE_v2.
5. **SP-1 E2E smoke test** — `SP_AUTH_TOKEN=<token> bash scripts/sp1-smoke-test.sh` — independent of above, can do now.
6. **Open GATE_EDGE_v2.md** when ready — new pre-registration, new holdout segment (cannot reuse 2026-02→06-05).

⚠️ **Do NOT**: adjust cost assumption, shrink holdout, use v1 holdout numbers to select threshold, then claim PASS. Must be full new pre-registration + new holdout. Do NOT resume feature-importance pruning (EXPERIMENT_LOG shows naive pruning hurt AUC).

### ML iteration log

**Before training a new model or re-trying an experiment, read `models/EXPERIMENT_LOG.md`.**
It records every run (promoted/reverted/superseded) with hypothesis → change → result →
conclusion, so you don't repeat failed experiments (e.g. naive feature pruning was tried
and hurt AUC — do not re-try). Add a new entry at the top after each training run.
Current promoted model: `model_v1.0.1_ef58f809` (threshold = 0.48).

### ML re-train command reference

```bash
# Re-export (if signals updated)
.tools/node-v22.22.3-darwin-arm64/bin/node scripts/ml/export_signals_d1.mjs --out data/signals_full.csv

# Re-label (if k or ATR logic changed)
python3 scripts/ml/label.py --in data/signals_full.csv --k 1.5 --out data/signals_labeled.csv

# Re-build features (if feature_schema.json changed)
python3 scripts/ml/build_features.py --in data/signals_full.csv --out data/features/

# Train + evaluate
python3 scripts/ml/train_lgbm.py --features data/features/features_v1.0.0_<hash>.parquet --targets data/features/features_v1.0.0_<hash>.targets.parquet
python3 scripts/ml/baselines.py --features data/features/features_v1.0.0_<hash>.parquet --targets data/features/features_v1.0.0_<hash>.targets.parquet
python3 scripts/ml/evaluate.py --meta models/meta_v1.0.0_<run_id>.json --baselines models/baselines_<run_id>.json --promote
```

### Key data health

> Single source of truth = `/api/d1/research-health`. Do not restate live counts here; query the
> endpoint. The notes below are qualitative/structural only.
> **Last reconciled 2026-06-24 by DeepSeek (T2.0); counts drift daily as snapshots settle.**

- `signals`: grows daily as the nightly snapshot ingests + settles forward returns. For exact
  totals, settled count, eligible (LONG_BREAK/VCP/BOUNCE) count, and date span → query
  `/api/d1/research-health`. (As of 2026-06-24 it reported ~103.8k signals, ~102.3k settled.)
- `indicators_json` coverage: recompute from `/api/d1/research-health` — do not trust any hardcoded ratio.
- `earnings_ratio_pct`: **~2.8% as of 2026-06-24** (down from 3.16% — total signals grew faster than
  earnings-window flags; SEC Edgar; target ~11% — still acceptable for training). Re-check via the endpoint.
- `universe_snapshot_months`: **15 rows (2025-04→2026-06) with real PIT variation** ✅ HYP-015 resolved — S&P 500 Wikipedia PIT backfill applied. Each month has 565–568 tickers reflecting actual index membership changes (was previously the identical 299-ticker watchlist). Delisting bias caveat remains (SPLK/ATVI/FRC etc have no Yahoo prices).
- `sp4_shadow_inferences`: ✅ **9 rows as of 2026-06-24 (first ever writes)** — pipeline unblocked &
  verified end-to-end. It had been stuck at **0 rows** due to FOUR chained bugs, all fixed 2026-06-24:
  1. `signalpilot-daily.yml` `workflow_run` condition bug (now gated on `conclusion == 'success'`).
  2. `/api/d1/signals` was settled-only (hardcoded `ret5d IS NOT NULL`) and never shipped
     `indicators_json` → SP-4 had no fresh signals to score. Fixed: added opt-in `?settled=0`
     param (returns unsettled rows + `indicators_json` + `previous_label`); default stays
     settled-only so the Verify/Quant Lab tab is unaffected. `shadow_inference.py` now calls
     `?days=7&settled=0`.
  3. `build_features.build()` returns a 3-tuple `(features, targets, dropped)` but
     `shadow_inference.py` unpacked 2 → `ValueError`. Fixed (`features_df, *_ = build(...)`).
  4. Promoted model `ef58f809` was never registered in `sp4_model_registry` (only the older
     `8aa032a3` was), so every insert hit the `model_run_id` FK and was silently swallowed by the
     handler's `catch {}`. Fixed by registering `ef58f809` via `POST /api/sp4/model` (2026-06-24).
  5. (hardening) `shadowHandler.ts` `catch {}` swallowed ALL insert errors as "duplicate" — which
     is what hid bug #4 for weeks. Fixed: UNIQUE conflicts are detected via `res.meta.changes`
     (returned as `duplicates`), required-field drops as `skipped`, and any real DB error now
     returns 500 instead of being silently eaten. Response shape: `{written, duplicates, skipped, total}`.
  6. (feature parity) `rs_rank`, `rs_vs_spy`, `ema50_slope` were NaN-filled (they're top-level
     snake_case D1 columns the training export reads, not inside `indicators_json`). Fixed: the
     `?settled=0` path now SELECTs them too → all 33 features resolve (mean prob 0.2916 → 0.3209).
  - Nightly should now self-sustain via `signalpilot-daily.yml`; re-verify after the next weekday run.
