"""
SP-4 Model Promotion Gate — evaluates a trained LightGBM against baselines.

Promotion criteria (all must pass):
  1. OOF AUC          > B3_logreg AUC + 0.02
  2. OOF precision    > B0_always_take precision + 0.02   (selectivity improvement)
  3. OOF avg_prec     > B0_always_take avg_prec
  4. Brier score      < B0_always_take brier
  5. Last 2 OOF folds individually: AUC >= 0.50 (model hasn't degraded recently)

Usage:
  python scripts/ml/evaluate.py \\
    --meta      models/meta_v1.0.0_<run_id>.json \\
    --baselines models/baselines_<run_id>.json \\
    [--promote]   # write promotion record if gate passes

Exits 0 if promoted, 1 if gate fails (CI-safe).
"""

import argparse
import json
import pathlib
import sys
from datetime import datetime


GATE_AUC_MARGIN        = 0.02   # vs logistic regression
GATE_PRECISION_MARGIN  = 0.02   # vs always-take
GATE_MIN_FOLD_AUC      = 0.50   # last 2 folds must each be ≥ this
GATE_AVG_PREC_MARGIN   = 0.00   # vs always-take (strict >=)
GATE_BRIER_MARGIN      = 0.00   # must be strictly lower than always-take


def load(path: str) -> dict:
    p = pathlib.Path(path)
    if not p.exists():
        sys.exit(f"File not found: {p}")
    return json.loads(p.read_text())


def check_gate(meta: dict, baselines: dict) -> tuple[bool, list[str], list[str]]:
    """Returns (passed, reasons_passed, reasons_failed)."""
    oof = meta.get("oof_metrics", {})
    bl  = baselines["baselines"]

    passed: list[str] = []
    failed: list[str] = []

    def chk(cond: bool, label: str) -> None:
        (passed if cond else failed).append(label)

    lgr_auc   = bl["B3_logreg"]["aggregate"].get("auc", 0)
    take_prec = bl["B0_always_take"]["aggregate"].get("precision", 0) or 0
    take_ap   = bl["B0_always_take"]["aggregate"].get("avg_prec", 0) or 0
    take_brier= bl["B0_always_take"]["aggregate"].get("brier", 1) or 1

    our_auc   = oof.get("auc", 0) or 0
    our_prec  = oof.get("precision", 0) or 0
    our_ap    = oof.get("avg_prec", 0) or 0
    our_brier = oof.get("brier", 1) or 1

    chk(our_auc  > lgr_auc   + GATE_AUC_MARGIN,
        f"AUC {our_auc:.4f} vs LogReg {lgr_auc:.4f} (+{GATE_AUC_MARGIN})")
    chk(our_prec > take_prec + GATE_PRECISION_MARGIN,
        f"Precision {our_prec:.4f} vs AlwaysTake {take_prec:.4f} (+{GATE_PRECISION_MARGIN})")
    chk(our_ap   > take_ap   + GATE_AVG_PREC_MARGIN,
        f"AvgPrec {our_ap:.4f} vs AlwaysTake {take_ap:.4f}")
    chk(our_brier < take_brier + GATE_BRIER_MARGIN,
        f"Brier {our_brier:.4f} < AlwaysTake {take_brier:.4f}")

    # Last 2 folds individually (skip if test set is too small to be meaningful)
    MIN_FOLD_TEST_N = 20
    folds = meta.get("fold_metrics", [])
    last2 = folds[-2:] if len(folds) >= 2 else folds
    for fold in last2:
        n_test = fold.get("n", fold.get("test_rows", 999))
        fold_auc = fold.get("auc", 0) or 0
        if n_test < MIN_FOLD_TEST_N:
            print(f"  [SKIP] Fold {fold['fold']} AUC check — only {n_test} test samples")
            continue
        chk(fold_auc >= GATE_MIN_FOLD_AUC,
            f"Fold {fold['fold']} AUC {fold_auc:.4f} >= {GATE_MIN_FOLD_AUC}")

    return (len(failed) == 0), passed, failed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meta",      required=True)
    ap.add_argument("--baselines", required=True)
    ap.add_argument("--oof",       default=None,
                    help="Path to OOF CSV (oof_v*.csv). If provided with --threshold, "
                         "re-computes precision at the given threshold for the gate check.")
    ap.add_argument("--threshold", type=float, default=0.50,
                    help="Decision threshold for precision gate (default 0.50)")
    ap.add_argument("--promote",   action="store_true",
                    help="Write a promotion record JSON if gate passes")
    ap.add_argument("--out-dir",   default="models/")
    args = ap.parse_args()

    meta      = load(args.meta)
    baselines = load(args.baselines)

    # If OOF CSV + custom threshold provided, re-compute precision at that threshold
    if args.oof and args.threshold != 0.50:
        import pandas as pd
        from sklearn.metrics import precision_score as _prec
        oof_df = pd.read_csv(args.oof)
        pred   = (oof_df["prob_take"] >= args.threshold).astype(int)
        if pred.sum() > 0:
            new_prec = round(float(_prec(oof_df["y_true"], pred, zero_division=0)), 4)
            print(f"[INFO] Recomputed precision at threshold={args.threshold}: {new_prec} "
                  f"(was {meta['oof_metrics'].get('precision','n/a')} at 0.50)")
            meta["oof_metrics"]["precision"] = new_prec
            meta["oof_metrics"]["_threshold"] = args.threshold

    print(f"\n=== SP-4 Model Promotion Gate ===")
    print(f"Run ID:        {meta['run_id']}")
    print(f"Schema:        v{meta['schema_version']}")
    print(f"Rows:          {meta['n_rows']:,}  base_rate={meta['base_rate']:.1%}")
    print(f"Features:      {meta['n_features']}")
    if meta.get("pending_hyp015"):
        print(f"[WARN] Missing features (HYP-015): {meta['pending_hyp015']}")
    print()

    print("Baseline summary:")
    for bname, bdata in baselines["baselines"].items():
        agg = bdata["aggregate"]
        print(f"  {bname:25s}  AUC={agg.get('auc','n/a')}  "
              f"prec={agg.get('precision','n/a')}  brier={agg.get('brier','n/a')}")

    oof = meta.get("oof_metrics", {})
    thresh_note = f" (at t={oof.get('_threshold',0.50)})" if "_threshold" in oof else ""
    print(f"\nCandidate OOF:  AUC={oof.get('auc','n/a')}  "
          f"prec={oof.get('precision','n/a')}{thresh_note}  brier={oof.get('brier','n/a')}")
    print()

    promoted, passed, failed = check_gate(meta, baselines)

    for r in passed:
        print(f"  [PASS] {r}")
    for r in failed:
        print(f"  [FAIL] {r}")

    print()
    if promoted:
        print(">>> GATE PASSED — model may be promoted to shadow inference <<<")
        if args.promote:
            promo = {
                "promoted_at":    datetime.utcnow().isoformat()[:19] + "Z",
                "model_run_id":   meta["run_id"],
                "baselines_run":  baselines["run_id"],
                "schema_version": meta["schema_version"],
                "oof_metrics":    oof,
                "gate_passed":    passed,
                "notes":          meta.get("notes", ""),
            }
            out_dir = pathlib.Path(args.out_dir)
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path = out_dir / f"promotion_{meta['run_id']}.json"
            out_path.write_text(json.dumps(promo, indent=2))
            print(f"Promotion record → {out_path}")
        sys.exit(0)
    else:
        print(">>> GATE FAILED — do not promote. Investigate failed checks above <<<")
        sys.exit(1)


if __name__ == "__main__":
    main()
