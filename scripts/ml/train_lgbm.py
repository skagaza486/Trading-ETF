"""
SP-4 LightGBM meta-label trainer — anchored walk-forward CV.

Meta-label framing: given that the rule engine (SP-2) fires a signal, should
the AI say TAKE (1) or PASS (0)?  Target = triple_barrier_label == 1 (upper
barrier hit within 5 days).

Walk-forward design (anchored):
  - Training window always starts at the earliest available row.
  - Each fold advances the cutoff by STEP_MONTHS; tests on the next TEST_MONTHS.
  - Minimum training set: MIN_TRAIN_ROWS rows (skip fold if not enough history).
  - Produces out-of-fold (OOF) predictions aligned to the original DataFrame index.

Outputs (written to --out-dir):
  model_v<schema_version>_<run_id>.pkl   — calibrated LightGBM model (joblib)
  oof_v<schema_version>_<run_id>.csv     — OOF predictions (signal_date, ticker,
                                           y_true, prob_take, fold)
  folds_v<schema_version>_<run_id>.json  — per-fold metrics
  meta_v<schema_version>_<run_id>.json   — run metadata (feature list, params,
                                           schema hash, row count)

Usage:
  python scripts/ml/train_lgbm.py \\
    --features data/features/features_v1.0.0_<hash>.parquet \\
    --targets  data/features/features_v1.0.0_<hash>.targets.parquet \\
    [--out-dir models/] [--tb-k 1.5] [--n-estimators 300] [--dry-run]
"""

import argparse
import json
import pathlib
import sys
import uuid
from datetime import datetime, timedelta

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    log_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)

try:
    import lightgbm as lgb
except ImportError:
    sys.exit("lightgbm not installed — run: pip install -r scripts/ml/requirements.txt")

SCHEMA_PATH = pathlib.Path(__file__).parent / "feature_schema.json"
MIN_TRAIN_ROWS = 150   # fewer rows → skip fold
TEST_MONTHS    = 2
STEP_MONTHS    = 1


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def load_data(feat_path: pathlib.Path, tgt_path: pathlib.Path, tb_k: float
              ) -> tuple[pd.DataFrame, pd.Series, list[str]]:
    schema = json.loads(SCHEMA_PATH.read_text())
    blocklist = set(schema["leakage_blocklist"])

    feats = pd.read_parquet(feat_path) if feat_path.suffix == ".parquet" else pd.read_csv(feat_path)
    tgts  = pd.read_parquet(tgt_path)  if tgt_path.suffix  == ".parquet" else pd.read_csv(tgt_path)

    df = pd.concat([feats, tgts], axis=1)

    leaked = set(df.columns) & blocklist
    if leaked:
        sys.exit(f"[FAIL] Leakage columns in features: {leaked}. Run leakage_audit.py first.")

    # Build binary meta-label: 1 = upper barrier (TAKE), 0 = PASS
    if "tb_label" not in df.columns:
        if "mfe5d" not in df.columns or "atr_at_signal" not in df.columns:
            sys.exit("Need tb_label or (mfe5d + mae5d + atr_at_signal) to build target. Run label.py first.")
        # Re-derive triple barrier
        from label import triple_barrier_label  # type: ignore[import]
        df = triple_barrier_label(df, k=tb_k)

    y = (df["tb_label"] == 1).astype(int)

    # Feature columns: declared schema features that are present
    declared = (
        [f["col"] for f in schema["features"]["numeric"]]
        + [f["col"] for f in schema["features"]["categorical"]]
        + [f["col"] for f in schema["features"]["boolean"]]
    )
    feat_cols = [c for c in declared if c in df.columns]

    if "signal_date" in df.columns:
        df["signal_date"] = pd.to_datetime(df["signal_date"])

    return df, y, feat_cols


# ---------------------------------------------------------------------------
# Walk-forward folds
# ---------------------------------------------------------------------------

def build_folds(dates: pd.Series) -> list[tuple[np.ndarray, np.ndarray]]:
    """
    Anchored walk-forward: training always starts at origin.
    Returns list of (train_idx, test_idx) numpy index arrays.
    """
    min_date = dates.min()
    max_date = dates.max()

    folds: list[tuple[np.ndarray, np.ndarray]] = []
    cutoff = min_date + pd.DateOffset(months=6)   # first training window ≥ 6 months

    while cutoff <= max_date - pd.DateOffset(months=TEST_MONTHS):
        test_end = cutoff + pd.DateOffset(months=TEST_MONTHS)
        train_mask = dates < cutoff
        test_mask  = (dates >= cutoff) & (dates < test_end)
        train_idx  = np.where(train_mask)[0]
        test_idx   = np.where(test_mask)[0]
        if len(train_idx) >= MIN_TRAIN_ROWS and len(test_idx) > 0:
            folds.append((train_idx, test_idx))
        cutoff += pd.DateOffset(months=STEP_MONTHS)

    return folds


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

def make_model(n_estimators: int, seed: int = 42) -> lgb.LGBMClassifier:
    return lgb.LGBMClassifier(
        n_estimators=n_estimators,
        max_depth=4,
        learning_rate=0.05,
        num_leaves=31,
        min_child_samples=20,
        subsample=0.8,
        colsample_bytree=0.8,
        class_weight="balanced",
        random_state=seed,
        verbosity=-1,
        n_jobs=-1,
    )


def fold_metrics(y_true: np.ndarray, prob: np.ndarray) -> dict:
    pred = (prob >= 0.5).astype(int)
    take_rate = float(pred.mean())
    metrics: dict = {
        "n": len(y_true),
        "take_rate": round(take_rate, 4),
        "base_rate": round(float(y_true.mean()), 4),
    }
    if y_true.sum() > 0 and y_true.sum() < len(y_true):
        metrics["auc"]       = round(float(roc_auc_score(y_true, prob)), 4)
        metrics["avg_prec"]  = round(float(average_precision_score(y_true, prob)), 4)
        metrics["brier"]     = round(float(brier_score_loss(y_true, prob)), 4)
        metrics["log_loss"]  = round(float(log_loss(y_true, prob)), 4)
        if pred.sum() > 0:
            metrics["precision"] = round(float(precision_score(y_true, pred, zero_division=0)), 4)
            metrics["recall"]    = round(float(recall_score(y_true, pred, zero_division=0)), 4)
    return metrics


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--features",     required=True, help="Feature parquet/CSV from build_features.py")
    ap.add_argument("--targets",      required=True, help="Target parquet/CSV (paired with features)")
    ap.add_argument("--out-dir",      default="models/")
    ap.add_argument("--tb-k",         type=float, default=1.5, help="ATR multiplier for triple barrier")
    ap.add_argument("--n-estimators", type=int,   default=300)
    ap.add_argument("--dry-run",      action="store_true", help="Run CV only, skip final model fit + save")
    args = ap.parse_args()

    feat_path = pathlib.Path(args.features)
    tgt_path  = pathlib.Path(args.targets)

    for p in (feat_path, tgt_path):
        if not p.exists():
            sys.exit(f"File not found: {p}")

    print(f"Loading features from {feat_path.name} …")
    df, y, feat_cols = load_data(feat_path, tgt_path, args.tb_k)

    n_total = len(df)
    n_take  = int(y.sum())
    print(f"Rows: {n_total:,}  |  TAKE={n_take} ({n_take/n_total:.1%})  |  Features: {len(feat_cols)}")

    dates  = df["signal_date"] if "signal_date" in df.columns else pd.Series(pd.date_range("2024-01-01", periods=n_total, freq="D"))
    folds  = build_folds(dates)
    X      = df[feat_cols].values.astype(np.float32)
    y_arr  = y.values

    if not folds:
        sys.exit("Not enough data to form walk-forward folds (need ≥6 months train + 2 months test).")

    print(f"\nAnchored walk-forward: {len(folds)} folds  (min_train={MIN_TRAIN_ROWS}, "
          f"test={TEST_MONTHS}mo, step={STEP_MONTHS}mo)\n")

    oof_rows: list[dict] = []
    fold_results: list[dict] = []

    for i, (tr_idx, te_idx) in enumerate(folds):
        X_tr, y_tr = X[tr_idx], y_arr[tr_idx]
        X_te, y_te = X[te_idx], y_arr[te_idx]

        model = make_model(args.n_estimators)
        model.fit(X_tr, y_tr, eval_set=[(X_te, y_te)], callbacks=[lgb.early_stopping(30, verbose=False)])
        prob_te = model.predict_proba(X_te)[:, 1]

        metrics = fold_metrics(y_te, prob_te)
        fold_info = {
            "fold":       i + 1,
            "train_rows": len(tr_idx),
            "test_rows":  len(te_idx),
            "cutoff":     str(dates.iloc[te_idx[0]].date()),
            **metrics,
        }
        fold_results.append(fold_info)

        te_dates   = df["signal_date"].iloc[te_idx].dt.strftime("%Y-%m-%d").values if "signal_date" in df.columns else [""] * len(te_idx)
        te_tickers = df["ticker"].iloc[te_idx].values if "ticker" in df.columns else [""] * len(te_idx)
        for j in range(len(te_idx)):
            oof_rows.append({
                "signal_date": te_dates[j],
                "ticker":      te_tickers[j],
                "y_true":      int(y_te[j]),
                "prob_take":   round(float(prob_te[j]), 4),
                "fold":        i + 1,
            })

        auc_str = f"  AUC={metrics.get('auc','n/a')}  prec={metrics.get('precision','n/a')}  brier={metrics.get('brier','n/a')}"
        print(f"  Fold {i+1}: train={len(tr_idx):4d}  test={len(te_idx):4d}  cutoff={fold_info['cutoff']}{auc_str}")

    # Aggregate OOF metrics
    oof_df = pd.DataFrame(oof_rows)
    if len(oof_df) > 0 and oof_df["y_true"].sum() > 0:
        agg = fold_metrics(oof_df["y_true"].values, oof_df["prob_take"].values)
        print(f"\nAggregate OOF: AUC={agg.get('auc','n/a')}  avg_prec={agg.get('avg_prec','n/a')}  "
              f"brier={agg.get('brier','n/a')}  precision@take={agg.get('precision','n/a')}")
    else:
        agg = {}

    if args.dry_run:
        print("\n[dry-run] Skipping final model fit and file writes.")
        return

    # Final model: train on ALL data with calibration
    print(f"\nFitting final model on all {n_total:,} rows …")
    base_model = make_model(args.n_estimators)
    cal_model  = CalibratedClassifierCV(base_model, method="isotonic", cv=3)
    cal_model.fit(X, y_arr)

    run_id  = uuid.uuid4().hex[:8]
    schema  = json.loads(SCHEMA_PATH.read_text())
    version = schema["version"]

    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f"v{version}_{run_id}"

    joblib.dump(cal_model, out_dir / f"model_{stem}.pkl")
    oof_df.to_csv(out_dir / f"oof_{stem}.csv", index=False)
    (out_dir / f"folds_{stem}.json").write_text(json.dumps(fold_results, indent=2))

    meta = {
        "run_id":          run_id,
        "schema_version":  version,
        "created_at":      datetime.utcnow().isoformat()[:19] + "Z",
        "n_rows":          n_total,
        "n_take":          n_take,
        "base_rate":       round(n_take / n_total, 4),
        "feature_cols":    feat_cols,
        "n_features":      len(feat_cols),
        "tb_k":            args.tb_k,
        "n_estimators":    args.n_estimators,
        "n_folds":         len(folds),
        "oof_metrics":     agg,
        "fold_metrics":    fold_results,
        "pending_hyp015":  schema.get("pending_hyt015", []),
        "notes":           "Sector/industry features absent until HYP-015 delivered.",
    }
    (out_dir / f"meta_{stem}.json").write_text(json.dumps(meta, indent=2))

    print(f"\nSaved:")
    print(f"  model   → {out_dir}/model_{stem}.pkl")
    print(f"  oof     → {out_dir}/oof_{stem}.csv")
    print(f"  folds   → {out_dir}/folds_{stem}.json")
    print(f"  meta    → {out_dir}/meta_{stem}.json")
    print(f"\nTo promote: python scripts/ml/evaluate.py --meta {out_dir}/meta_{stem}.json")


if __name__ == "__main__":
    main()
