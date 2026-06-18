-- B2: Cloudflare D1 schema — trading-etf-db
-- Run via: wrangler d1 execute trading-etf-db --file=schema/d1-init.sql

-- Daily stock signals written by cron after each market close
CREATE TABLE IF NOT EXISTS signals (
  ticker          TEXT NOT NULL,
  signal_date     TEXT NOT NULL,  -- YYYY-MM-DD
  label           TEXT NOT NULL,
  previous_label  TEXT,
  regime          TEXT,
  rs_rank         INTEGER,        -- percentile 0-100 vs universe
  rsi14           REAL,
  rvol            REAL,
  rs_vs_spy       REAL,
  clv             REAL,
  ema50_slope     REAL,
  indicators_json TEXT,           -- full StockIndicatorSnapshot as JSON blob
  research_flags  TEXT,           -- comma-separated flags e.g. "BASE_BREAK"
  reason          TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
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
