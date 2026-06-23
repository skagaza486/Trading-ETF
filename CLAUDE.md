# Claude Code Instructions

## Runtime environment

`node`, `npm`, and `npx` are NOT on the system PATH.
Always use the bundled binaries:

```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/<tool>
```

Common aliases for this session:
```bash
alias node='.tools/node-v22.22.3-darwin-arm64/bin/node'
alias vite='node node_modules/.bin/vite'
alias wrangler='node node_modules/.bin/wrangler'
alias tsc='node node_modules/.bin/tsc'
```

## TypeScript check

```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/tsc --noEmit
```

Always run this before deploying. Zero errors required.

## Build + deploy (ALWAYS both together)

```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/vite build && .tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler deploy
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
# Query
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler d1 execute trading-etf-db --remote --command "SELECT ..."

# Run migration file
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler d1 execute trading-etf-db --remote --file=schema/some-migration.sql
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

## Current sprint (as of 2026-06-23)

**Context:** GPT is offline — Claude handles both `trading-etf` and SignalPilot lines.  
**If you are another AI reading this:** role boundaries and task assignments are in [`docs/HANDOFF_GPT.md`](docs/HANDOFF_GPT.md). Full backlog with blocking deps is in [`WORKLIST.md`](WORKLIST.md). Read those before starting any work.

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

> Single source of truth = `/api/d1/research-health`. Do not restate these numbers elsewhere; link here.

- `signals` total: 422 eligible (LONG_BREAK/VCP/BOUNCE with ret5d settled); 74,043 settled overall
- `indicators_json` coverage: 419/422 ✅
- `earnings_ratio_pct`: **3.12%** verified 2026-06-23 (2,308 / 74,043; SEC Edgar; target ~11% — acceptable for training). HYP-013 ✅ resolved. (Any doc still quoting 0.02% is stale.)
- `universe_snapshot_months`: **15 rows (2025-04→2026-06) BUT false coverage** — every month is the identical current 299-ticker watchlist (zero membership diff first↔last). Survivorship bias intact → HYP-015 P1 ❌. Avg5D/backtest figures are inflated until real membership history is reconstructed.
- `sp4_shadow_inferences`: accumulating nightly since 2026-06-23
