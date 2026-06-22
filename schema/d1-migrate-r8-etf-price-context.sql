-- R8: add ETF daily context for card-level day change and sparkline
-- Run via: wrangler d1 execute trading-etf-db --remote --file=schema/d1-migrate-r8-etf-price-context.sql

ALTER TABLE etf_signals ADD COLUMN prev_close REAL;
ALTER TABLE etf_signals ADD COLUMN recent_close_json TEXT;
