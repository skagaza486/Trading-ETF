-- R9: research data support tables for earnings-aware backfill and point-in-time universe snapshots
-- Run via: wrangler d1 execute trading-etf-db --remote --file=schema/d1-migrate-r9-research-data.sql

CREATE TABLE IF NOT EXISTS earnings_calendar (
  ticker        TEXT NOT NULL,
  earnings_date TEXT NOT NULL,  -- YYYY-MM-DD
  source        TEXT DEFAULT 'finnhub',
  updated_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (ticker, earnings_date)
);

CREATE INDEX IF NOT EXISTS idx_earnings_calendar_date   ON earnings_calendar (earnings_date DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_ticker ON earnings_calendar (ticker, earnings_date DESC);

CREATE TABLE IF NOT EXISTS watchlist_universe_snapshots (
  snapshot_month TEXT NOT NULL,  -- YYYY-MM
  effective_date TEXT NOT NULL,  -- YYYY-MM-DD
  ticker         TEXT NOT NULL,
  name           TEXT,
  sector         TEXT,
  tier           INTEGER,
  source         TEXT DEFAULT 'repo_watchlist',
  created_at     TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (snapshot_month, ticker)
);

CREATE INDEX IF NOT EXISTS idx_universe_snapshots_month  ON watchlist_universe_snapshots (snapshot_month DESC);
CREATE INDEX IF NOT EXISTS idx_universe_snapshots_ticker ON watchlist_universe_snapshots (ticker, snapshot_month DESC);
