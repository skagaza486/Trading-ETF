-- SP-4: AI Shadow Mode schema
-- Apply: wrangler d1 execute trading-etf-db --remote --file=schema/signalpilot-sp4.sql
--
-- Two tables:
--   sp4_model_registry     — one row per promoted model; active = latest promoted_at
--   sp4_shadow_inferences  — daily per-signal AI score (no trades taken here)

CREATE TABLE IF NOT EXISTS sp4_model_registry (
  run_id         TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  promoted_at    TEXT NOT NULL,
  oof_auc        REAL,
  oof_precision  REAL,
  oof_brier      REAL,
  n_rows         INTEGER,
  n_features     INTEGER,
  feature_hash   TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sp4_shadow_inferences (
  id             TEXT PRIMARY KEY,
  inference_date TEXT NOT NULL,
  account_id     TEXT NOT NULL,
  ticker         TEXT NOT NULL,
  signal_date    TEXT NOT NULL,
  signal_label   TEXT NOT NULL,
  prob_take      REAL NOT NULL,
  decision       TEXT NOT NULL,    -- 'TAKE' | 'PASS'
  model_run_id   TEXT NOT NULL REFERENCES sp4_model_registry(run_id),
  schema_version TEXT NOT NULL,
  feature_hash   TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  UNIQUE (inference_date, account_id, ticker, signal_date)
);

CREATE INDEX IF NOT EXISTS idx_sp4_shadow_date_acct
  ON sp4_shadow_inferences (inference_date, account_id);
