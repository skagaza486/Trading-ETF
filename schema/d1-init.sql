-- B2: Cloudflare D1 schema — trading-etf-db
-- Run via: wrangler d1 execute trading-etf-db --file=schema/d1-init.sql

-- Daily stock signals written by cron after each market close
-- Forward-return columns (ret1d…mae10d) are backfilled by cron once outcome bars settle
CREATE TABLE IF NOT EXISTS signals (
  ticker              TEXT NOT NULL,
  signal_date         TEXT NOT NULL,  -- YYYY-MM-DD
  label               TEXT NOT NULL,
  previous_label      TEXT,
  regime              TEXT,
  rs_rank             INTEGER,        -- percentile 0-100 vs universe
  rsi14               REAL,
  rvol                REAL,
  rs_vs_spy           REAL,
  clv                 REAL,
  ema50_slope         REAL,
  indicators_json     TEXT,           -- full StockIndicatorSnapshot as JSON blob
  research_flags      TEXT,           -- comma-separated flags e.g. "BASE_BREAK"
  reason              TEXT,
  -- forward returns (B2+) — NULL until outcome bars are available
  close_at_signal     REAL,
  next_open           REAL,
  ret1d               REAL,
  ret3d               REAL,
  ret5d               REAL,
  ret10d              REAL,
  ret5d_vs_spy        REAL,
  ret10d_vs_spy       REAL,
  mfe5d               REAL,
  mae5d               REAL,
  mfe10d              REAL,
  mae10d              REAL,
  earnings_in_window  INTEGER,        -- 0 | 1
  suggested_stop_loss REAL,
  stop_loss_hit       INTEGER,        -- 0 | 1 | NULL
  atr_at_signal       REAL,
  created_at          TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (ticker, signal_date)
);

-- Gate Summary snapshots — one row per label per EXP run
-- Populated automatically by cron when enough signals accumulate (≥100 records)
CREATE TABLE IF NOT EXISTS gate_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,    -- YYYY-MM-DD when this snapshot was taken
  label         TEXT NOT NULL,    -- e.g. 'LONG_BOUNCE'
  n             INTEGER,
  avg_5d        REAL,
  median_5d     REAL,
  vs_spy        REAL,
  mae_5d        REAL,
  g1            TEXT,             -- 'PASS' | 'FAIL' | 'NA'
  g2            TEXT,
  g3            TEXT,
  g4            TEXT,
  g5            TEXT,
  g6            TEXT,
  g7            TEXT,
  status        TEXT,             -- 'PASS' | 'FAIL' | 'INSUFFICIENT'
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signals_date   ON signals (signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_signals_label  ON signals (label, signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_gate_snapshots ON gate_snapshots (snapshot_date DESC, label);

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
