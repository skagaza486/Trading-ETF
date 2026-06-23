"""
SP-4 Baseline comparisons — 5 benchmarks the LightGBM model must beat.

Baselines evaluated on the same OOF splits used in train_lgbm.py:
  B0  Always TAKE     — buy every signal the rule engine fires
  B1  Always PASS     — never take (maximum selectivity / zero recall)
  B2  Majority prior  — always predict the training-set majority class
  B3  Logistic Regression (L2, class-balanced)
  B4  Random Forest (shallow, class-balanced)

Usage:
  python scripts/ml/baselines.py \\
    --features data/features/features_v1.0.0_<hash>.parquet \\
    --targets  data/features/features_v1.0.0_<hash>.targets.parquet \\
    [--out-dir models/] [--tb-k 1.5]

Outputs:
  baselines_<run_id>.json   — per-fold + aggregate metrics for all 5 baselines
"""

import argparse
import json
import pathlib
import sys
import uuid
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# Reuse helpers from train_lgbm
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from train_lgbm import load_data, build_folds, fold_metrics  # type: ignore[import]

SCHEMA_PATH = pathlib.Path(__file__).parent / "feature_schema.json"


# ---------------------------------------------------------------------------
# Baseline implementations
# ---------------------------------------------------------------------------

def always_take(X_te: np.ndarray, _: np.ndarray) -> np.ndarray:
    return np.ones(len(X_te), dtype=float)


def always_pass(X_te: np.ndarray, _: np.ndarray) -> np.ndarray:
    return np.zeros(len(X_te), dtype=float)


def majority_prior(X_te: np.ndarray, y_tr: np.ndarray) -> np.ndarray:
    rate = float(y_tr.mean())
    return np.full(len(X_te), rate, dtype=float)


BASELINES: list[tuple[str, str]] = [
    ("B0_always_take",    "Always TAKE — baseline for rule-only precision"),
    ("B1_always_pass",    "Always PASS — zero-trade baseline"),
    ("B2_prior",          "Majority prior — always predict training base rate"),
    ("B3_logreg",         "Logistic Regression (L2, balanced)"),
    ("B4_random_forest",  "Random Forest (max_depth=5, balanced)"),
]


def fit_predict_sklearn(
    model_cls,
    model_kwargs: dict,
    X_tr: np.ndarray,
    y_tr: np.ndarray,
    X_te: np.ndarray,
) -> np.ndarray:
    from sklearn.impute import SimpleImputer
    pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler",  StandardScaler()),
        ("clf",     model_cls(**model_kwargs)),
    ])
    pipe.fit(X_tr, y_tr)
    return pipe.predict_proba(X_te)[:, 1]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--features", required=True)
    ap.add_argument("--targets",  required=True)
    ap.add_argument("--out-dir",  default="models/")
    ap.add_argument("--tb-k",     type=float, default=1.5)
    args = ap.parse_args()

    feat_path = pathlib.Path(args.features)
    tgt_path  = pathlib.Path(args.targets)
    for p in (feat_path, tgt_path):
        if not p.exists():
            sys.exit(f"File not found: {p}")

    print(f"Loading features …")
    df, y, feat_cols = load_data(feat_path, tgt_path, args.tb_k)

    dates  = df["signal_date"] if "signal_date" in df.columns else pd.Series(
        pd.date_range("2024-01-01", periods=len(df), freq="D"))
    folds  = build_folds(dates)
    X      = df[feat_cols].values.astype(np.float32)
    y_arr  = y.values

    if not folds:
        sys.exit("Not enough data to form walk-forward folds.")

    print(f"Rows: {len(df):,}  |  TAKE={int(y.sum())} ({y.mean():.1%})  |  Folds: {len(folds)}\n")

    results: dict[str, dict] = {}

    for bname, bdesc in BASELINES:
        fold_rows: list[dict] = []
        all_true: list[int]   = []
        all_prob: list[float] = []

        for i, (tr_idx, te_idx) in enumerate(folds):
            X_tr, y_tr = X[tr_idx], y_arr[tr_idx]
            X_te, y_te = X[te_idx], y_arr[te_idx]

            if bname == "B0_always_take":
                prob = always_take(X_te, y_tr)
            elif bname == "B1_always_pass":
                prob = always_pass(X_te, y_tr)
            elif bname == "B2_prior":
                prob = majority_prior(X_te, y_tr)
            elif bname == "B3_logreg":
                prob = fit_predict_sklearn(
                    LogisticRegression,
                    {"C": 1.0, "class_weight": "balanced", "max_iter": 500, "random_state": 42},
                    X_tr, y_tr, X_te,
                )
            elif bname == "B4_random_forest":
                prob = fit_predict_sklearn(
                    RandomForestClassifier,
                    {"n_estimators": 100, "max_depth": 5, "class_weight": "balanced",
                     "random_state": 42, "n_jobs": -1},
                    X_tr, y_tr, X_te,
                )
            else:
                prob = majority_prior(X_te, y_tr)

            fold_rows.append({"fold": i + 1, **fold_metrics(y_te, prob)})
            all_true.extend(y_te.tolist())
            all_prob.extend(prob.tolist())

        agg = fold_metrics(np.array(all_true), np.array(all_prob))
        results[bname] = {
            "description": bdesc,
            "aggregate":   agg,
            "folds":       fold_rows,
        }
        auc_str = f"AUC={agg.get('auc','n/a')}  prec={agg.get('precision','n/a')}  brier={agg.get('brier','n/a')}"
        print(f"  {bname:25s}  {auc_str}")

    run_id = uuid.uuid4().hex[:8]
    schema = json.loads(SCHEMA_PATH.read_text())
    out = {
        "run_id":       run_id,
        "created_at":   datetime.utcnow().isoformat()[:19] + "Z",
        "schema_version": schema["version"],
        "n_rows":       len(df),
        "base_rate":    round(float(y.mean()), 4),
        "n_folds":      len(folds),
        "baselines":    results,
    }

    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"baselines_{run_id}.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"\nSaved → {out_path}")
    print(f"Pass this to evaluate.py with --baselines {out_path}")


if __name__ == "__main__":
    main()
