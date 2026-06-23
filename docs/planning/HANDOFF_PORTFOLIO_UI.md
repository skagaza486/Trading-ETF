# HANDOFF → DeepSeek: Portfolio UI (Zone D)

> **Created:** 2026-06-24 by Claude · **Owner:** DeepSeek · **Reviewer:** Claude · **Priority:** P2
> **Zone:** D (UI/Frontend — "declare intent before touching; one AI at a time"). Claude is NOT
> touching `src/web/` while this is assigned to you. Read
> [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md) + [`MULTI_AI_WORKFLOW.md`](MULTI_AI_WORKFLOW.md) +
> `CLAUDE.md` (runtime) before starting.

## Goal

A **Portfolio** tab for the personal capital-management pivot: monitor real holdings + drive the
weekly decision process. The user owns HK$5M (Phase 1 = HK$500K), executes manually in Futu.

## Locked decisions (from the user, 2026-06-24)

1. **Position data = browser-local manual entry.** No Futu API. The user types positions into the
   UI; persist in `localStorage`. No D1 `positions` table, no Google-Sheet import for v1. Keep the
   storage layer behind a small module so it can later swap to D1 without touching components.
2. **Scope = Dashboard + Decision Cockpit** (one tab, two sections).

## Section A — Monitoring Dashboard (read-only)

- **Positions table:** ticker, tier (ETF / Core / Tactical), shares, entry price, current price,
  unrealized P&L (% and HK$), stop-loss level, **distance to stop**, days held.
- **Live price:** reuse the Yahoo proxy via existing hooks — see
  `src/web/shared/hooks/useTickerHistory.ts` / `useIntraday.ts`. Do NOT fetch Yahoo with bespoke code.
- **Allocation vs limits:** cash %, per-sector %, position count — checked against
  [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md) §2 risk table. Surface breaches inline (e.g. sector >25%,
  cash below regime floor, >15 positions).
- **Regime banner:** read current regime from `/api/snapshot/latest` (KV) — it already carries
  `regime`. Reuse `classifyRegime`/the snapshot, don't recompute.
- **Risk alerts:** stop-loss hit, sector concentration, cash floor (5/15/30% by regime),
  3-consecutive-loss pause flag. Derive from positions + journal.

## Section B — Decision Cockpit

- **Weekly screener candidates:** the funnel's ranked candidate list (Tier-2/Tier-3).
  ⚠️ **Dependency:** this needs the fundamentals-aware screener output from **T2.7–T2.8**
  (extend `src/engine/stockScreenerEngine.ts` + a read endpoint for the `fundamentals` D1 table).
  Until that lands, render the candidate panel against the existing technical screener output
  (`stockScreenerEngine` already does Steps 1–2 + RS) and clearly mark fundamentals as "pending".
- **Trade journal:** add/close-position form capturing **entry reason** (free text — process
  discipline is mandatory per EXECUTION_PLAN §11 "don't trade without writing down reasons"),
  decision date, and exit conditions. Persist in `localStorage` alongside positions.

## Data sources (all already exist)

| Need | Source |
|------|--------|
| Current regime + snapshot stocks | `GET /api/snapshot/latest` (KV) |
| Signals + (new) medium-term returns | `GET /api/d1/signals?days=365` (now includes `ret1m/3m/6m/12m`) |
| Live prices / charts | existing hooks in `src/web/shared/hooks/` (Yahoo proxy) |
| Fundamentals (for cockpit) | `fundamentals` D1 table exists; **needs a read endpoint** — coordinate, this is a new `/api/d1/...` route (Zone A/B; ask Claude or add per workflow) |

## Where the code goes

- New tab: register in `src/App.tsx` — `TabId` (line ~24), `tabs` array (~124), `TAB_META` (~130),
  and the render switch (~870). Mirror how `Dashboard`/`Stocks`/`ETFs` tabs are wired.
- New view: `src/web/features/portfolio/PortfolioView.tsx` (+ a `portfolio/` folder for subcomponents
  and a `usePortfolioStore.ts` localStorage hook). Follow the structure of existing feature folders
  (`src/web/features/detail/`, `discover/`).
- Reuse shared UI/styles in `src/web/shared/`. Match existing module-CSS conventions.

## Honest-limitations disclosure (mandatory — EXECUTION_PLAN §9)

The cockpit's candidates come from a **paper-validated discretionary heuristic, not a backtested
edge**. Show a persistent, non-dismissable note to that effect near the candidate list. Do not
present screener output as predicted return.

## Constraints / runtime

- Bundled node only: `.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/<tool>` (see CLAUDE.md).
- **`tsc --noEmit` must be 0 errors** before you finish.
- Deploy = **`vite build && wrangler deploy` together** to `trading-etf` (never deploy alone).
  ⚠️ Production deploy is high-severity — get the user's explicit OK before deploying.
- Do NOT touch Zones A/B/C/E/F (engine internals, schema, analysis scripts, SignalPilot, ML).
  If you need an engine/endpoint change (e.g. fundamentals read route), declare it here and let
  Claude do the Zone A/B part, or get explicit sign-off.

## Done = ✅ 2026-06-24 (DeepSeek)

Portfolio tab renders; positions persist across reload (localStorage); P&L + risk-limit checks +
regime show correctly; journal captures entry reasons; cockpit lists candidates with the
limitations note; `tsc` clean. Awaiting user OK for `vite build && wrangler deploy`.
Updated task matrix in `MULTI_AI_WORKFLOW.md`.
