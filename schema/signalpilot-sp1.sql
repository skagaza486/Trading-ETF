-- SP-1: Paper Ledger MVP
--
-- ADR-SP-002 resolved: USD-only. No FX conversion in this phase.
-- ADR-SP-003 resolved: FIFO tax lots. Most common US default; deterministic.
--
-- Integer minor units throughout:
--   Monetary amounts : cents  (USD × 100).  $1.00 = 100.
--   Share quantities : whole shares (INTEGER). No fractional shares in SP-1.
--
-- Run once:
--   wrangler d1 execute signalpilot-db --remote \
--     --config wrangler.signalpilot.toml \
--     --file schema/signalpilot-sp1.sql

CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active'  -- active | suspended
);

-- One intent per (account, ticker, signal_date): idempotency key.
CREATE TABLE IF NOT EXISTS trade_intents (
  id                    TEXT    PRIMARY KEY,
  account_id            TEXT    NOT NULL REFERENCES accounts(id),
  ticker                TEXT    NOT NULL,
  direction             TEXT    NOT NULL DEFAULT 'LONG',
  signal_date           TEXT    NOT NULL,
  signal_label          TEXT    NOT NULL,
  source_signal_id      INTEGER,
  target_notional_cents INTEGER NOT NULL,
  eligibility_status    TEXT    NOT NULL,  -- APPROVED | REJECTED
  rejection_reason      TEXT,
  created_at            TEXT    NOT NULL,
  created_by            TEXT    NOT NULL DEFAULT 'system',
  UNIQUE (account_id, ticker, signal_date)
);

CREATE INDEX IF NOT EXISTS idx_intents_account_date
  ON trade_intents (account_id, signal_date DESC);

CREATE TABLE IF NOT EXISTS broker_orders (
  id               TEXT    PRIMARY KEY,
  intent_id        TEXT    NOT NULL REFERENCES trade_intents(id),
  account_id       TEXT    NOT NULL REFERENCES accounts(id),
  ticker           TEXT    NOT NULL,
  side             TEXT    NOT NULL,   -- BUY | SELL
  order_type       TEXT    NOT NULL DEFAULT 'MARKET',
  qty              INTEGER NOT NULL,   -- whole shares
  status           TEXT    NOT NULL DEFAULT 'PENDING',
  submitted_at     TEXT    NOT NULL,
  adapter          TEXT    NOT NULL DEFAULT 'paper',
  adapter_order_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_intent
  ON broker_orders (intent_id);

CREATE TABLE IF NOT EXISTS order_events (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES broker_orders(id),
  event_type  TEXT NOT NULL,
  ts          TEXT NOT NULL,
  detail_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_order
  ON order_events (order_id);

-- Immutable fill records.
-- net_cents = -(gross + commission) for BUY; +(gross - commission) for SELL.
-- price_source: 'next_open' | 'close_fallback' (audit trail for data quality).
CREATE TABLE IF NOT EXISTS fills (
  id               TEXT    PRIMARY KEY,
  order_id         TEXT    NOT NULL REFERENCES broker_orders(id),
  account_id       TEXT    NOT NULL REFERENCES accounts(id),
  ticker           TEXT    NOT NULL,
  side             TEXT    NOT NULL,
  fill_date        TEXT    NOT NULL,
  fill_price_cents INTEGER NOT NULL,
  qty              INTEGER NOT NULL,
  gross_cents      INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL DEFAULT 0,
  net_cents        INTEGER NOT NULL,
  price_source     TEXT    NOT NULL DEFAULT 'next_open',
  created_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fills_account
  ON fills (account_id, fill_date DESC);

-- Append-only cash ledger.
-- amount_cents: positive = cash in, negative = cash out.
-- running_balance_cents: denormalised for fast balance reads.
CREATE TABLE IF NOT EXISTS cash_ledger (
  id                    TEXT    PRIMARY KEY,
  account_id            TEXT    NOT NULL REFERENCES accounts(id),
  ts                    TEXT    NOT NULL,
  entry_type            TEXT    NOT NULL,
  --   DEPOSIT | WITHDRAWAL | FILL_BUY | FILL_SELL | COMMISSION | ADJUSTMENT
  amount_cents          INTEGER NOT NULL,
  running_balance_cents INTEGER NOT NULL,
  reference_id          TEXT,
  description           TEXT
);

CREATE INDEX IF NOT EXISTS idx_cash_account
  ON cash_ledger (account_id, ts DESC, id DESC);

-- FIFO tax lots (ADR-SP-003). One lot per fill. Closed lots preserved.
CREATE TABLE IF NOT EXISTS position_lots (
  id                 TEXT    PRIMARY KEY,
  account_id         TEXT    NOT NULL REFERENCES accounts(id),
  ticker             TEXT    NOT NULL,
  fill_id            TEXT    NOT NULL REFERENCES fills(id),
  open_date          TEXT    NOT NULL,
  qty                INTEGER NOT NULL,
  cost_basis_cents   INTEGER NOT NULL,
  closed_qty         INTEGER NOT NULL DEFAULT 0,
  close_date         TEXT,
  realized_pnl_cents INTEGER,
  status             TEXT    NOT NULL DEFAULT 'OPEN'  -- OPEN | PARTIAL | CLOSED
);

CREATE INDEX IF NOT EXISTS idx_lots_account_ticker
  ON position_lots (account_id, ticker, status);

-- Daily NAV snapshots for reconciliation.
CREATE TABLE IF NOT EXISTS reconciliation (
  id                 TEXT    PRIMARY KEY,
  account_id         TEXT    NOT NULL REFERENCES accounts(id),
  recon_date         TEXT    NOT NULL,
  cash_cents         INTEGER NOT NULL,
  market_value_cents INTEGER NOT NULL,
  nav_cents          INTEGER NOT NULL,
  position_count     INTEGER NOT NULL,
  created_at         TEXT    NOT NULL,
  UNIQUE (account_id, recon_date)
);

-- Seed the default paper account (idempotent).
INSERT OR IGNORE INTO accounts (id, name, currency, created_at, status)
  VALUES ('paper-001', 'Paper Account USD', 'USD', datetime('now'), 'active');

-- Seed $100,000 initial deposit = 10,000,000 cents (idempotent).
INSERT OR IGNORE INTO cash_ledger
  (id, account_id, ts, entry_type, amount_cents, running_balance_cents, reference_id, description)
  VALUES (
    'seed-paper-001', 'paper-001', datetime('now'),
    'DEPOSIT', 10000000, 10000000, NULL, 'Initial paper account $100,000'
  );
