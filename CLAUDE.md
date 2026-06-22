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

### What's running autonomously (no action needed)

- `trading-etf` nightly snapshot: GH Actions `snapshot.yml` 21:30 UTC Mon–Fri ✅
- SignalPilot SP-2 nightly batch: GH Actions `signalpilot-daily.yml` (deployed, accumulating data) ✅

### What was just completed

- SP-4 indicator backfill: 419/422 historical signals now have `rs_rank`, `rsi14`, `rvol`, `rs_vs_spy`, `clv`, `ema50_slope`, `indicators_json` (3 PSTG rows skipped, delisted)
- SP-0 Auth spine + SP-1 Paper Ledger + SP-2 Rule-Only Shadow: code complete, deployed

### Immediate next actions (priority order)

1. **SP-1 E2E smoke test** — run `SP_AUTH_TOKEN=<token> bash scripts/sp1-smoke-test.sh` to formally close SP-1 exit gate
2. **HYP-015** — `watchlist_universe_snapshots` has only 2026-06 (1 month); needs 14 more months for SP-4 sector features. Use `npm run research:backfill-universe -- --merge-file <path> --apply` with manual JSON for missing months
3. **SP-4 first training run** — unblocked once HYP-015 + ≥20 trading days SP-2 data ready:

```bash
.tools/node-v22.22.3-darwin-arm64/bin/node scripts/ml/export_signals_d1.mjs --out data/signals_full.csv
python scripts/ml/build_features.py --in data/signals_full.csv --out data/features/
python scripts/ml/train_lgbm.py --features data/features/features_v1.0.0_<hash>.parquet
python scripts/ml/baselines.py --features data/features/features_v1.0.0_<hash>.parquet
python scripts/ml/evaluate.py --oof models/oof_v*.csv --baselines models/baselines_*.json --promote
```

### Key data health

- `signals` total: ~422 eligible (LONG_BREAK/VCP/BOUNCE with ret5d settled)
- `indicators_json` coverage: 419/422 ✅
- `earnings_ratio_pct`: ~3.12% (SEC Edgar, target ~11% — acceptable for training)
- `universe_snapshot_months`: 1 (needs 14+ for point-in-time sector features)
