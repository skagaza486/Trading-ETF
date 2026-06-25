-- Capital Manager — core schema (P1)
-- Deploy: wrangler d1 execute capital-db --remote --file=schema/capital-r1-core.sql
-- All monetary columns are integer cents (USD). Never use REAL for money.

PRAGMA journal_mode = WAL;

-- ── positions ───────────────────────────────────────────────────────────────
-- Live holdings. One row per open position.
CREATE TABLE IF NOT EXISTS positions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker         TEXT    NOT NULL,
  qty            INTEGER NOT NULL CHECK (qty > 0),
  avg_cost_cents INTEGER NOT NULL CHECK (avg_cost_cents > 0),  -- per share
  peak_price_cents INTEGER NOT NULL CHECK (peak_price_cents > 0), -- highest close since open
  sleeve         TEXT    NOT NULL CHECK (sleeve IN ('etf', 'stock')),
  sector         TEXT    NOT NULL,
  opened_at      TEXT    NOT NULL,  -- ISO date YYYY-MM-DD
  earnings_date  TEXT,              -- nearest upcoming earnings ISO date (nullable)
  UNIQUE (ticker, sleeve)           -- one open position per ticker per sleeve
);

CREATE INDEX IF NOT EXISTS idx_positions_sleeve  ON positions (sleeve);
CREATE INDEX IF NOT EXISTS idx_positions_sector  ON positions (sector);

-- ── cash_ledger ──────────────────────────────────────────────────────────────
-- Append-only cash flow ledger. Full account state is reconstructable from this table.
-- amount_cents: positive = inflow (sell / dividend / deposit)
--               negative = outflow (buy / withdrawal)
CREATE TABLE IF NOT EXISTS cash_ledger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT    NOT NULL CHECK (type IN ('buy', 'sell', 'dividend', 'deposit', 'withdrawal')),
  ticker       TEXT,
  amount_cents INTEGER NOT NULL,  -- signed; integer cents
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  memo         TEXT
);

CREATE INDEX IF NOT EXISTS idx_cash_ledger_created ON cash_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_ticker  ON cash_ledger (ticker);

-- ── realized_pnl ─────────────────────────────────────────────────────────────
-- One row per closed position. Used by three-loss detection.
-- pnl_cents: positive = profit, negative = loss (after cost)
CREATE TABLE IF NOT EXISTS realized_pnl (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker     TEXT    NOT NULL,
  pnl_cents  INTEGER NOT NULL,
  closed_at  TEXT    NOT NULL  -- ISO date YYYY-MM-DD
);

CREATE INDEX IF NOT EXISTS idx_realized_pnl_closed ON realized_pnl (closed_at DESC);

-- ── risk_state ───────────────────────────────────────────────────────────────
-- Single-row table. UPDATE in place; never INSERT additional rows.
CREATE TABLE IF NOT EXISTS risk_state (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  capital_base_cents  INTEGER NOT NULL,   -- total capital (cash + market value), recalculated daily
  currency            TEXT    NOT NULL DEFAULT 'USD',
  regime              TEXT    NOT NULL CHECK (regime IN ('long_friendly', 'neutral', 'short_friendly')),
  pause_until         TEXT,               -- ISO date; NULL means not paused
  last_3_results      TEXT    NOT NULL DEFAULT '[]'  -- JSON array of 'win'/'loss', newest first, max 3
);

-- Seed with one row so UPDATE always finds a target
INSERT OR IGNORE INTO risk_state (id, capital_base_cents, currency, regime, pause_until, last_3_results)
VALUES (1, 0, 'USD', 'neutral', NULL, '[]');

-- ── trade_log ────────────────────────────────────────────────────────────────
-- Append-only audit trail. One row per action card generated (buy or sell proposal).
-- rule_triggers: JSON array of RuleId strings that caused the action
CREATE TABLE IF NOT EXISTS trade_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  action         TEXT    NOT NULL CHECK (action IN ('entry', 'exit', 'rebalance', 'pause')),
  ticker         TEXT,
  sleeve         TEXT    CHECK (sleeve IN ('etf', 'stock', NULL)),
  approved       INTEGER NOT NULL CHECK (approved IN (0, 1)),  -- BOOLEAN
  rule_triggers  TEXT    NOT NULL DEFAULT '[]',  -- JSON array of rule ids
  detail         TEXT,   -- free-text rationale / violation summaries
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_trade_log_created ON trade_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_log_ticker  ON trade_log (ticker);
