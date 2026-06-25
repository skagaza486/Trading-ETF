-- Capital Manager P5 — paper_trades table
-- Two-week paper wall tracker for stock strategy validation.
-- Candidates are logged here during the paper wall period; pass/fail
-- criteria are computed from this table in the frontend.
--
-- Pass criteria (REVAMP_PLAN §6):
--   1. ≥4 consecutive weeks with ≥3 candidates each
--   2. Period P&L positive (sum of simulated pnl_cents)
--   3. No single position drawdown > −15%
--   4. At least one non-RISK_ON (neutral/short_friendly) week
--   5. Weekly SOP followed (all weeks present in log)

CREATE TABLE IF NOT EXISTS paper_trades (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker        TEXT    NOT NULL,
  -- ISO Monday of the week this candidate belongs to (e.g. '2026-06-23')
  week_start    TEXT    NOT NULL,
  entry_price_cents  INTEGER NOT NULL,
  -- Updated daily by the user (NULL = not yet priced)
  current_price_cents INTEGER,
  sector        TEXT    NOT NULL,
  -- Regime at the time of entry (for non-RISK_ON week check)
  regime        TEXT    NOT NULL DEFAULT 'neutral',
  -- 'open' while tracking, 'closed' when removed from paper portfolio
  status        TEXT    NOT NULL DEFAULT 'open',
  closed_price_cents INTEGER,
  closed_at     TEXT,
  note          TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_week ON paper_trades(week_start);
CREATE INDEX IF NOT EXISTS idx_paper_trades_status ON paper_trades(status);
