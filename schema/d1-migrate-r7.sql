-- R7: ETF weekly signals table for walk-forward replay via D1
-- Run via: wrangler d1 execute trading-etf-db --remote --file=schema/d1-migrate-r7.sql

CREATE TABLE IF NOT EXISTS etf_signals (
  ticker            TEXT NOT NULL,
  week_ending_date  TEXT NOT NULL,  -- YYYY-MM-DD (last trading day of the week)
  label             TEXT NOT NULL,  -- FAVOUR | WATCH | WAIT | AVOID | REVIEW
  indicators_json   TEXT,           -- ETFIndicatorSnapshot as JSON blob
  regime            TEXT,
  close_at_signal   REAL,
  ret1w             REAL,           -- next-week return; settled 1 week after signal
  ret4w             REAL,           -- 4-week forward return; settled 4 weeks after signal
  created_at        TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (ticker, week_ending_date)
);

CREATE INDEX IF NOT EXISTS idx_etf_signals_date   ON etf_signals (week_ending_date DESC);
CREATE INDEX IF NOT EXISTS idx_etf_signals_ticker ON etf_signals (ticker, week_ending_date DESC);
