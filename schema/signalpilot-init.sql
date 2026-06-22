-- SignalPilot D1 schema — signalpilot-db
-- Run via: wrangler d1 execute signalpilot-db --remote --file=schema/signalpilot-init.sql
--
-- SP-0 (Auth & Audit Spine) scope only. Ledger / intents / orders / fills /
-- positions tables are added in SP-1 (see SIGNALPILOT_ROADMAP.md).
--
-- This DB is the WRITE side of SignalPilot. The existing trading-etf-db is bound
-- read-only (TRADING_ETF_DB_RO) and is never written from this Worker.

-- Append-only, tamper-evident audit trail of every state change and every
-- denied/failed mutation attempt. Rows are never updated or deleted.
--   hash      = sha256(canonical(prev_hash, ts, actor, action, resource, outcome, detail_json, request_id))
--   prev_hash = hash of the immediately preceding row ('GENESIS' for the first)
-- A broken chain (hash mismatch) is evidence of tampering.
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL,            -- UTC ISO-8601 (set by app, not DB, for determinism)
  actor        TEXT NOT NULL,            -- 'user' | 'system'
  action       TEXT NOT NULL,            -- e.g. 'kill_switch.set','kill_switch.clear','policy.update','approval.grant','model.promote','auth.denied'
  resource     TEXT,                     -- affected entity id, nullable
  outcome      TEXT NOT NULL,            -- 'allow' | 'deny' | 'ok' | 'error'
  detail_json  TEXT,                     -- structured context; NEVER contains secrets
  request_id   TEXT,                     -- correlation id for one HTTP request
  prev_hash    TEXT NOT NULL,
  hash         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_ts     ON audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action, ts DESC);

-- Server-side control flags. The kill switch (trading_disabled) is the source of
-- truth that mutation endpoints fail-closed against. Mirrored into KV for
-- low-latency reads; this table is the durable, auditable record.
CREATE TABLE IF NOT EXISTS control_flags (
  name        TEXT PRIMARY KEY,          -- e.g. 'trading_disabled'
  value       TEXT NOT NULL,             -- '1' | '0'
  updated_at  TEXT NOT NULL,             -- UTC ISO-8601
  updated_by  TEXT NOT NULL,             -- 'user' | 'system'
  reason      TEXT
);

-- Default: trading DISABLED until explicitly enabled (fail-closed by construction).
INSERT OR IGNORE INTO control_flags (name, value, updated_at, updated_by, reason)
VALUES ('trading_disabled', '1', datetime('now'), 'system', 'initial fail-closed default');
