-- R11 migration: add medium-term forward-return columns to signals table.
-- Supports the capital-management pivot (1–12 month holds) — see docs/planning/EXECUTION_PLAN.md.
-- Run via: wrangler d1 execute trading-etf-db --remote --file=schema/d1-migrate-r11-medium-term.sql
--
-- SQLite ALTER TABLE only supports ADD COLUMN (no IF NOT EXISTS) —
-- safe to re-run; duplicate-column errors are ignorable.
--
-- Horizons are TRADING-DAY based (consistent with ret5d/ret10d): 1m=21, 3m=63, 6m=126, 12m=252 td.
-- These columns stay NULL until the outcome bars settle months later, and the only historical
-- sample that can ever fill them is single-regime (2025-H2 bull). Not a bug — see EXECUTION_PLAN §9.

ALTER TABLE signals ADD COLUMN ret1m         REAL;
ALTER TABLE signals ADD COLUMN ret3m         REAL;
ALTER TABLE signals ADD COLUMN ret6m         REAL;
ALTER TABLE signals ADD COLUMN ret12m        REAL;
ALTER TABLE signals ADD COLUMN ret1m_vs_spy  REAL;
ALTER TABLE signals ADD COLUMN ret3m_vs_spy  REAL;
ALTER TABLE signals ADD COLUMN ret6m_vs_spy  REAL;
ALTER TABLE signals ADD COLUMN ret12m_vs_spy REAL;
