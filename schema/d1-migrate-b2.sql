-- B2+ migration: add forward-return columns to signals table
-- Run via: wrangler d1 execute trading-etf-db --file=schema/d1-migrate-b2.sql
--
-- SQLite ALTER TABLE only supports ADD COLUMN (no IF NOT EXISTS) —
-- safe to re-run; duplicate-column errors are ignorable.

ALTER TABLE signals ADD COLUMN close_at_signal     REAL;
ALTER TABLE signals ADD COLUMN ret1d               REAL;
ALTER TABLE signals ADD COLUMN ret3d               REAL;
ALTER TABLE signals ADD COLUMN ret5d               REAL;
ALTER TABLE signals ADD COLUMN ret10d              REAL;
ALTER TABLE signals ADD COLUMN ret5d_vs_spy        REAL;
ALTER TABLE signals ADD COLUMN ret10d_vs_spy       REAL;
ALTER TABLE signals ADD COLUMN mfe5d               REAL;
ALTER TABLE signals ADD COLUMN mae5d               REAL;
ALTER TABLE signals ADD COLUMN mfe10d              REAL;
ALTER TABLE signals ADD COLUMN mae10d              REAL;
ALTER TABLE signals ADD COLUMN earnings_in_window  INTEGER;
ALTER TABLE signals ADD COLUMN suggested_stop_loss REAL;
ALTER TABLE signals ADD COLUMN stop_loss_hit       INTEGER;
ALTER TABLE signals ADD COLUMN atr_at_signal       REAL;
