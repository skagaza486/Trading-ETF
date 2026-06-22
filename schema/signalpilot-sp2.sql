-- SP-2: Rule-Only Shadow Portfolio additions.
--
-- Run once:
--   wrangler d1 execute signalpilot-db --remote \
--     --config wrangler.signalpilot.toml \
--     --file schema/signalpilot-sp2.sql

-- Extend position_lots: ATR at entry drives price-stop; sector drives exposure cap.
-- NULL for SP-1 lots; price-stop is skipped when NULL.
ALTER TABLE position_lots ADD COLUMN atr_at_entry REAL;
ALTER TABLE position_lots ADD COLUMN sector TEXT;

-- One row per trading day: cash + cost-basis NAV + decision counts.
-- market_value_cents uses cost basis until live prices are wired in SP-3.
CREATE TABLE IF NOT EXISTS strategy_daily_snapshots (
  id                  TEXT    PRIMARY KEY,
  snapshot_date       TEXT    NOT NULL,
  account_id          TEXT    NOT NULL REFERENCES accounts(id),
  cash_cents          INTEGER NOT NULL,
  market_value_cents  INTEGER NOT NULL,
  nav_cents           INTEGER NOT NULL,
  open_positions      INTEGER NOT NULL DEFAULT 0,
  new_entries         INTEGER NOT NULL DEFAULT 0,
  rejected_entries    INTEGER NOT NULL DEFAULT 0,
  exits_executed      INTEGER NOT NULL DEFAULT 0,
  realized_pnl_cents  INTEGER NOT NULL DEFAULT 0,
  policy_version      TEXT    NOT NULL,
  created_at          TEXT    NOT NULL,
  UNIQUE (account_id, snapshot_date)
);

-- Full decision log: every signal evaluated per day, including rejected ones.
-- Drives opportunity-cost analysis and rejection-reason breakdown.
CREATE TABLE IF NOT EXISTS candidate_decisions (
  id               TEXT    PRIMARY KEY,
  decision_date    TEXT    NOT NULL,
  account_id       TEXT    NOT NULL REFERENCES accounts(id),
  ticker           TEXT    NOT NULL,
  signal_label     TEXT    NOT NULL,
  signal_date      TEXT    NOT NULL,
  decision         TEXT    NOT NULL,  -- APPROVED | REJECTED
  rejection_layer  TEXT,              -- ELIGIBILITY | RISK | SIZING
  rejection_code   TEXT,
  intent_id        TEXT    REFERENCES trade_intents(id),
  policy_version   TEXT    NOT NULL,
  created_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_candidates_date_account
  ON candidate_decisions (decision_date DESC, account_id);

CREATE INDEX IF NOT EXISTS idx_candidates_ticker_date
  ON candidate_decisions (ticker, decision_date DESC);
