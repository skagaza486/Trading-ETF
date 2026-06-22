"""
SP-4 Daily Shadow Inference — scores today's eligible signals with the
promoted LightGBM model and writes predictions to the SignalPilot Worker.

This script runs in GitHub Actions AFTER the SP-2 batch. It never places
trades. Its output (prob_take, decision) is stored in sp4_shadow_inferences
for later comparison against SP-2 rule-only decisions.

ADR-SP-004 decision: offline batch (GH Actions) → Worker endpoint → D1.

Model file location:
  models/model_v<schema_version>_<run_id>.pkl  (committed to repo)
  models/meta_v<schema_version>_<run_id>.json  (committed to repo, locates pkl)

The latest promoted model is identified by:
  1. --model-meta <path>   (explicit)
  2. Most recent models/promotion_*.json  (auto-discover)

Usage:
  python scripts/ml/shadow_inference.py \\
    [--model-meta models/meta_v1.0.0_<run_id>.json] \\
    [--date YYYY-MM-DD]   # defaults to today

  Required env:
    SP_AUTH_TOKEN   — SignalPilot Worker bearer token
    WORKER_URL      — optional, defaults to production URL
    TRADING_ETF_URL — optional, defaults to production URL
"""

import argparse
import glob
import hashlib
import json
import os
import pathlib
import sys
import uuid
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import requests

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from build_features import build  # type: ignore[import]

SCHEMA_PATH    = pathlib.Path(__file__).parent / "feature_schema.json"
MODELS_DIR     = pathlib.Path(__file__).parent.parent.parent / "models"
SP_WORKER_URL  = os.environ.get("SP_WORKER_URL",    "https://signalpilot.skagaza486.workers.dev")
ETF_WORKER_URL = os.environ.get("TRADING_ETF_URL",  "https://trading-etf.skagaza486.workers.dev")
SP_AUTH_TOKEN  = os.environ.get("SP_AUTH_TOKEN")
TAKE_THRESHOLD = 0.55   # prob_take >= this → decision TAKE


# ---------------------------------------------------------------------------
# Model discovery
# ---------------------------------------------------------------------------

def find_latest_promotion() -> pathlib.Path | None:
    promos = sorted(MODELS_DIR.glob("promotion_*.json"))
    return promos[-1] if promos else None


def load_model_and_meta(meta_path: pathlib.Path | None) -> tuple[object, dict]:
    if meta_path is None:
        promo_path = find_latest_promotion()
        if promo_path is None:
            sys.exit("No promoted model found. Run evaluate.py --promote first.")
        promo = json.loads(promo_path.read_text())
        run_id = promo["model_run_id"]
        meta_files = list(MODELS_DIR.glob(f"meta_*{run_id}*.json"))
        if not meta_files:
            sys.exit(f"Meta file not found for run_id={run_id}")
        meta_path = meta_files[0]

    meta = json.loads(meta_path.read_text())
    run_id = meta["run_id"]
    pkl_files = list(MODELS_DIR.glob(f"model_*{run_id}*.pkl"))
    if not pkl_files:
        sys.exit(f"Model pkl not found for run_id={run_id}. Expected in {MODELS_DIR}/")
    model = joblib.load(pkl_files[0])
    return model, meta


# ---------------------------------------------------------------------------
# Signal fetch
# ---------------------------------------------------------------------------

def fetch_today_signals(date: str) -> pd.DataFrame:
    url = f"{ETF_WORKER_URL}/api/d1/signals"
    resp = requests.get(url, params={"days": 2}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    rows = data.get("records", data) if isinstance(data, dict) else data
    df = pd.DataFrame(rows)
    if df.empty:
        return df

    # Normalise date column name
    if "signalDate" in df.columns:
        df = df.rename(columns={"signalDate": "signal_date"})
    df["signal_date"] = pd.to_datetime(df["signal_date"]).dt.strftime("%Y-%m-%d")

    schema = json.loads(SCHEMA_PATH.read_text())
    eligible = {f["col"] for f in schema["features"]["categorical"]
                if f["col"] == "label"}
    eligible_labels = next(
        (f["values"] for f in schema["features"]["categorical"] if f["col"] == "label"),
        ["LONG_BREAK", "LONG_VCP", "LONG_BOUNCE"],
    )

    df = df[df["signal_date"] == date].copy()
    df = df[df.get("label", df.get("label", pd.Series(dtype=str))).isin(eligible_labels)]
    return df.reset_index(drop=True)


# ---------------------------------------------------------------------------
# Feature build (reuse SP-3 pipeline)
# ---------------------------------------------------------------------------

def build_inference_features(df_signals: pd.DataFrame, feat_cols: list[str]) -> np.ndarray:
    schema = json.loads(SCHEMA_PATH.read_text())
    features_df, _, _ = build(df_signals, schema)
    available = [c for c in feat_cols if c in features_df.columns]
    missing   = [c for c in feat_cols if c not in features_df.columns]
    if missing:
        print(f"[WARN] {len(missing)} features absent from signals: {missing}", file=sys.stderr)
        for c in missing:
            features_df[c] = np.nan
    X = features_df[feat_cols].values.astype(np.float32)
    return X


# ---------------------------------------------------------------------------
# Drift monitoring
# ---------------------------------------------------------------------------

def compute_drift_stats(probs: np.ndarray, recent_probs: list[float] | None) -> dict:
    stats: dict = {
        "n":          len(probs),
        "mean_prob":  round(float(probs.mean()), 4) if len(probs) else None,
        "take_rate":  round(float((probs >= TAKE_THRESHOLD).mean()), 4) if len(probs) else None,
        "p10":        round(float(np.percentile(probs, 10)), 4) if len(probs) else None,
        "p90":        round(float(np.percentile(probs, 90)), 4) if len(probs) else None,
    }
    if recent_probs and len(probs) > 0:
        hist = np.array(recent_probs)
        # KL divergence proxy: mean shift alert if |today_mean - hist_mean| > 0.10
        hist_mean = float(hist.mean())
        today_mean = float(probs.mean())
        stats["hist_mean"] = round(hist_mean, 4)
        stats["mean_shift"] = round(abs(today_mean - hist_mean), 4)
        stats["drift_alert"] = abs(today_mean - hist_mean) > 0.10
    return stats


# ---------------------------------------------------------------------------
# Post to Worker
# ---------------------------------------------------------------------------

def post_inferences(inferences: list[dict]) -> dict:
    if not SP_AUTH_TOKEN:
        sys.exit("Missing SP_AUTH_TOKEN env var")

    ts    = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    nonce = f"sp4-shadow-{uuid.uuid4().hex[:12]}"

    resp = requests.post(
        f"{SP_WORKER_URL}/api/sp4/shadow",
        json={"inferences": inferences},
        headers={
            "Authorization":  f"Bearer {SP_AUTH_TOKEN}",
            "X-SP-Timestamp": ts,
            "X-SP-Nonce":     nonce,
            "Content-Type":   "application/json",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-meta", help="Path to meta_*.json for the promoted model")
    ap.add_argument("--date",       default=datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    ap.add_argument("--dry-run",    action="store_true", help="Score but don't POST to Worker")
    args = ap.parse_args()

    meta_path = pathlib.Path(args.model_meta) if args.model_meta else None
    model, meta = load_model_and_meta(meta_path)
    feat_cols = meta["feature_cols"]

    print(f"SP-4 shadow inference  date={args.date}  model={meta['run_id']}  features={len(feat_cols)}")

    df_signals = fetch_today_signals(args.date)
    if df_signals.empty:
        print(f"No eligible signals for {args.date}. Nothing to score.")
        return

    print(f"Eligible signals: {len(df_signals)}")

    X = build_inference_features(df_signals, feat_cols)
    probs = model.predict_proba(X)[:, 1]

    inferences: list[dict] = []
    for i, row in df_signals.iterrows():
        prob = float(probs[i])
        inferences.append({
            "id":           f"sp4-{args.date}-{row.get('ticker','?')}-{uuid.uuid4().hex[:6]}",
            "inferenceDate": args.date,
            "ticker":        str(row.get("ticker", "")),
            "signalDate":    str(row.get("signal_date", args.date)),
            "signalLabel":   str(row.get("label", "")),
            "probTake":      round(prob, 4),
            "decision":      "TAKE" if prob >= TAKE_THRESHOLD else "PASS",
            "modelRunId":    meta["run_id"],
            "schemaVersion": meta["schema_version"],
            "featureHash":   meta.get("oof_metrics", {}).get("feature_hash", ""),
        })

    takes  = [r for r in inferences if r["decision"] == "TAKE"]
    passes = [r for r in inferences if r["decision"] == "PASS"]
    drift  = compute_drift_stats(probs, None)

    print(f"\n=== SP-4 Shadow ({args.date}) ===")
    print(f"Scored:  {len(inferences)}")
    print(f"TAKE:    {len(takes)}  ({drift['take_rate']:.0%})")
    print(f"PASS:    {len(passes)}")
    print(f"Mean prob: {drift['mean_prob']}  P10={drift['p10']}  P90={drift['p90']}")
    if drift.get("drift_alert"):
        print(f"[DRIFT ALERT] Mean prob shift vs history: {drift['mean_shift']:.3f}")
    for r in takes:
        print(f"  + {r['ticker']:6s}  p={r['probTake']:.3f}")

    if args.dry_run:
        print("\n[dry-run] Skipping POST to Worker.")
        return

    result = post_inferences(inferences)
    print(f"\nWorker wrote {result.get('written', '?')} rows.")


if __name__ == "__main__":
    main()
