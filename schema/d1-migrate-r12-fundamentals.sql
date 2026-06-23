-- R12 migration: fundamentals table for the stock-selection funnel (Steps 3–4).
-- Supports the capital-management pivot — see docs/planning/EXECUTION_PLAN.md §4.
-- Run via: wrangler d1 execute trading-etf-db --remote --file=schema/d1-migrate-r12-fundamentals.sql
--
-- Snapshot-DATED (PRIMARY KEY ticker+as_of_date): each fetch writes a dated row so we accumulate
-- our OWN point-in-time series going forward. This is the only way to partially mitigate the fact
-- that yfinance exposes current/TTM fundamentals only, with NO historical/point-in-time data —
-- so the fundamentals filter is forward-only and CANNOT be backtested against history.
-- See EXECUTION_PLAN §9 limitations.

CREATE TABLE IF NOT EXISTS fundamentals (
  ticker               TEXT    NOT NULL,
  as_of_date           TEXT    NOT NULL,   -- ISO date the fetch was taken (our PIT anchor)
  sector               TEXT,
  roe                  REAL,               -- return on equity (fraction, e.g. 0.18 = 18%)
  pe                   REAL,               -- trailing P/E
  forward_pe           REAL,
  peg                  REAL,               -- PEG ratio
  debt_to_equity       REAL,               -- D/E (yfinance reports as % sometimes; store raw)
  revenue_growth_yoy   REAL,               -- fraction
  earnings_growth_yoy  REAL,               -- fraction
  free_cash_flow       REAL,               -- absolute FCF (currency units)
  profitable           INTEGER,            -- 1 if trailing EPS > 0, else 0
  market_cap           REAL,
  source               TEXT    DEFAULT 'yfinance',
  fetched_at           TEXT,               -- ISO timestamp of fetch
  PRIMARY KEY (ticker, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_fundamentals_as_of ON fundamentals (as_of_date);
CREATE INDEX IF NOT EXISTS idx_fundamentals_ticker ON fundamentals (ticker);
