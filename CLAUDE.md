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
- Cron: `30 21 * * 1-5` (21:30 UTC Mon–Fri = 90 min after US market close)

There is an older worker named `tradingetf` (no hyphen) — **do not deploy to it**.

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
- **Cron** (`worker.ts` → `cronSnapshot.ts`): writes KV snapshot + D1 signals + settles forward returns daily
- **Backfill endpoint**: `GET /api/admin/backfill?offset=0` — processes 30 stocks at a time for historical data population
