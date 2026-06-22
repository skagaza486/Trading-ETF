# HYP-015 Universe Snapshot Backfill

`HYP-015` is no longer blocked on plumbing. The remaining problem is historical month coverage: `point_in_time=1` already works, but it can only be as good as the `watchlist_universe_snapshots` rows we load into D1.

## Current constraint

- Git history for `src/data/watchlist.ts` currently only yields `2026-06`.
- Earlier months therefore need manual reconstruction from whatever monthly review artifact or portfolio-governance note existed at the time.
- We should not fake those older rosters from today's watchlist. That would only hide survivorship / selection bias instead of fixing it.

## Sparse reconstruction flow

The backfill script now supports sparse manual snapshots and auto-carries them forward month by month until the next explicit change month.

Example:

- You provide `2025-04` and `2025-09`.
- The script emits `2025-04`, `2025-05`, `2025-06`, `2025-07`, `2025-08` from the `2025-04` roster.
- `2025-09` then becomes the new carried roster until the next explicit month.

That means we only need to reconstruct months where the watchlist actually changed, plus the first month we want to cover.

## Seed file

Use [universe-snapshots.template.json](/Users/tony/COde/Trading%20ETF/docs/research/universe-snapshots.template.json) as the manual seed file.

Fill it with the earliest trusted month plus any later change months:

```json
{
  "snapshots": [
    {
      "snapshotMonth": "2025-04",
      "effectiveDate": "2025-04-30",
      "tickers": [
        { "ticker": "AAPL", "name": "Apple", "sector": "Technology", "tier": 1 }
      ]
    }
  ]
}
```

## Apply

```bash
INGEST_TOKEN=... npm run research:backfill-universe -- --merge-file docs/research/universe-snapshots.template.json --apply
```

## Verify

1. `curl https://trading-etf.skagaza486.workers.dev/api/d1/research-health`
2. Confirm `pointInTimeHealth.monthsBeforeFirstSnapshot = 0`
3. Run `python scripts/ml/fetch_signals.py --days 730 --point-in-time`
4. Confirm `missing_months=0` and `dropped_before_first_snapshot=0`
