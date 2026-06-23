"""
GATE-EDGE: Pre-registered holdout test for SP-4 edge verification.

Evaluates whether the rule-based signals have a positive, cost-adjusted,
statistically significant excess return on the frozen holdout set.

Pre-registration: GATE_EDGE.md
Holdout definition: data/holdout_freeze_v1.json
Decision rules: GATE_EDGE.md §7

Usage:
    python3 scripts/ml/gate_edge.py [--signals data/signals_labeled.csv] [--out models/gate_edge_result.json]
"""

import argparse
import json
import math
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
FREEZE_FILE = ROOT / "data" / "holdout_freeze_v1.json"
DEFAULT_SIGNALS = ROOT / "data" / "signals_labeled.csv"
DEFAULT_OUT = ROOT / "models" / "gate_edge_result.json"
MODEL_FILE = ROOT / "models" / "model_v1.0.1_ef58f809.pkl"
FEATURES_PARQUET = ROOT / "data" / "features" / "features_v1.0.1_88b7c91b50fc.parquet"
META_FILE = ROOT / "models" / "meta_v1.0.1_ef58f809.json"

N_BOOT = 10_000
BLOCK_SIZE = 5
ALPHA = 0.05
PASS_MEAN_THRESHOLD = 0.005   # §7: mean net ret > +0.5%
PASS_ML_PP_THRESHOLD = 0.05   # §7: ML precision >= always-take + 5pp


def load_freeze():
    with open(FREEZE_FILE) as f:
        return json.load(f)


def block_bootstrap_mean(values: np.ndarray, n_boot: int = N_BOOT, block_size: int = BLOCK_SIZE, rng=None):
    """Block bootstrap CI and p-value for mean of values."""
    if rng is None:
        rng = np.random.default_rng(42)
    n = len(values)
    n_blocks = math.ceil(n / block_size)
    total_blocks = math.ceil(n / block_size)
    # Build blocks from sorted array (already sorted by date)
    blocks = [values[i * block_size: (i + 1) * block_size] for i in range(total_blocks)]
    # Remove any empty blocks
    blocks = [b for b in blocks if len(b) > 0]
    n_available = len(blocks)

    boot_means = np.empty(n_boot)
    for i in range(n_boot):
        chosen = rng.integers(0, n_available, size=n_blocks)
        sample = np.concatenate([blocks[j] for j in chosen])[:n]
        boot_means[i] = sample.mean()

    obs_mean = values.mean()
    # p-value: one-tailed, fraction of bootstrap means <= 0 (under H0: mean <= 0)
    p_value = float(np.mean(boot_means <= 0))
    ci_lo = float(np.percentile(boot_means, 2.5))
    ci_hi = float(np.percentile(boot_means, 97.5))
    return obs_mean, p_value, ci_lo, ci_hi, boot_means


def benjamini_hochberg(p_values: list[float], alpha: float = ALPHA):
    """BH correction. Returns list of (original_p, adjusted_p, significant)."""
    n = len(p_values)
    if n == 0:
        return []
    indexed = sorted(enumerate(p_values), key=lambda x: x[1])
    result = [None] * n
    prev_significant = False
    for rank, (orig_idx, p) in enumerate(indexed, 1):
        bh_threshold = (rank / n) * alpha
        significant = p <= bh_threshold
        result[orig_idx] = (p, bh_threshold, significant)
    # Enforce monotonicity: if a smaller p is non-significant, larger ones also non-significant
    # (standard BH step-up)
    sig_indices = [i for i, r in enumerate(result) if r[2]]
    if not sig_indices:
        return result
    # All ranks up to max significant rank are significant
    max_rank = max(indexed.index(x) for x in indexed if result[x[0]][2]) if sig_indices else -1
    # Simpler: use the standard formulation directly
    sorted_ps = [p for _, p in indexed]
    sorted_orig = [i for i, _ in indexed]
    adjusted = [None] * n
    for rank_0, (orig_idx, p) in enumerate(indexed):
        adj = min(p * n / (rank_0 + 1), 1.0)
        adjusted[orig_idx] = adj
    # Enforce monotone: cummin from the end
    min_adj = 1.0
    for rank_0 in range(n - 1, -1, -1):
        orig_idx = indexed[rank_0][0]
        adjusted[orig_idx] = min(adjusted[orig_idx], min_adj)
        min_adj = adjusted[orig_idx]
    return [(p_values[i], adjusted[i], adjusted[i] <= alpha) for i in range(n)]


def run_primary_test(net_ret: np.ndarray):
    obs_mean, p_value, ci_lo, ci_hi, boot_means = block_bootstrap_mean(net_ret)
    return {
        "n": len(net_ret),
        "mean_net_ret": round(obs_mean, 6),
        "ci_95_lo": round(ci_lo, 6),
        "ci_95_hi": round(ci_hi, 6),
        "p_value_one_tailed": round(p_value, 4),
        "significant": p_value < ALPHA,
        "mean_above_threshold": obs_mean > PASS_MEAN_THRESHOLD,
    }


def run_half_consistency(net_ret: np.ndarray, dates: pd.Series):
    mid = len(net_ret) // 2
    first_half = net_ret[:mid]
    second_half = net_ret[mid:]
    return {
        "first_half_mean": round(float(first_half.mean()), 6) if len(first_half) > 0 else None,
        "second_half_mean": round(float(second_half.mean()), 6) if len(second_half) > 0 else None,
        "first_half_n": len(first_half),
        "second_half_n": len(second_half),
        "consistent": (len(first_half) > 0 and len(second_half) > 0 and
                       float(first_half.mean()) > 0 and float(second_half.mean()) > 0),
    }


def run_secondary_slices(holdout: pd.DataFrame, cost: float):
    """Per-label and per-regime slices. Returns slice results + BH correction."""
    slices = {}

    # Per tb_label
    for lbl, name in [(-1, "LOWER"), (0, "VERTICAL"), (1, "UPPER")]:
        sub = holdout[holdout["tb_label"] == lbl]["net_ret"].values
        if len(sub) < 5:
            slices[f"label_{name}"] = {"n": len(sub), "mean": None, "p_value": None, "note": "too few samples (<5)"}
            continue
        obs_mean, p_val, ci_lo, ci_hi, _ = block_bootstrap_mean(sub)
        slices[f"label_{name}"] = {
            "n": len(sub),
            "mean": round(obs_mean, 6),
            "ci_95": [round(ci_lo, 6), round(ci_hi, 6)],
            "p_value": round(p_val, 4),
        }

    # Per regime
    for regime in holdout["regime"].unique():
        sub = holdout[holdout["regime"] == regime]["net_ret"].values
        if len(sub) < 5:
            slices[f"regime_{regime}"] = {"n": len(sub), "mean": None, "p_value": None, "note": "too few samples (<5)"}
            continue
        obs_mean, p_val, ci_lo, ci_hi, _ = block_bootstrap_mean(sub)
        slices[f"regime_{regime}"] = {
            "n": len(sub),
            "mean": round(obs_mean, 6),
            "ci_95": [round(ci_lo, 6), round(ci_hi, 6)],
            "p_value": round(p_val, 4),
        }

    # BH correction on slices that have a p_value
    valid_slices = [(k, v) for k, v in slices.items() if v.get("p_value") is not None]
    if valid_slices:
        ps = [v["p_value"] for _, v in valid_slices]
        bh_results = benjamini_hochberg(ps)
        for (k, v), (orig_p, adj_p, sig) in zip(valid_slices, bh_results):
            slices[k]["bh_adjusted_p"] = round(adj_p, 4)
            slices[k]["bh_significant"] = sig

    return slices


def run_ml_overlay(holdout_df: pd.DataFrame, freeze: dict):
    """Evaluate v1.0.1 ML model on holdout features."""
    try:
        model = joblib.load(MODEL_FILE)
        with open(META_FILE) as f:
            meta = json.load(f)
    except FileNotFoundError as e:
        return {"error": str(e), "note": "ML overlay skipped"}

    feature_cols = meta["feature_cols"]
    threshold = freeze["model_threshold"]  # 0.48

    try:
        feats = pd.read_parquet(FEATURES_PARQUET)
    except FileNotFoundError as e:
        return {"error": str(e), "note": "features parquet not found"}

    # Filter to holdout dates
    holdout_mask = feats["signal_date"] >= freeze["holdout"]["signal_date_gte"]
    feats_h = feats[holdout_mask].reset_index(drop=True)

    if len(feats_h) == 0:
        return {"error": "No holdout rows in features parquet", "n": 0}

    # Encode categoricals to match training
    for col in ["label", "previous_label", "regime"]:
        if col in feats_h.columns:
            feats_h[col] = feats_h[col].astype("category").cat.codes

    X = feats_h[feature_cols].copy()

    try:
        proba = model.predict_proba(X)[:, 1]
    except Exception as e:
        return {"error": f"predict_proba failed: {e}"}

    take_mask = proba >= threshold
    n_take = int(take_mask.sum())

    # Get tb_label for these rows — merge with holdout_df on signal_date + ticker
    merged = feats_h[["signal_date", "ticker"]].copy()
    merged["proba"] = proba
    merged["ml_take"] = take_mask
    merged = merged.merge(holdout_df[["signal_date", "ticker", "tb_label", "ret5d_vs_spy"]],
                          on=["signal_date", "ticker"], how="inner")

    n_holdout = len(merged)
    always_take_prec = float((merged["tb_label"] == 1).mean())
    ml_prec = float((merged.loc[merged["ml_take"], "tb_label"] == 1).mean()) if n_take > 0 else 0.0
    pp_diff = ml_prec - always_take_prec

    return {
        "n_holdout_matched": n_holdout,
        "threshold": threshold,
        "n_take": n_take,
        "take_rate": round(n_take / n_holdout, 4) if n_holdout > 0 else 0,
        "always_take_precision": round(always_take_prec, 4),
        "ml_precision_at_take": round(ml_prec, 4),
        "pp_vs_always_take": round(pp_diff, 4),
        "passes_5pp_gate": pp_diff >= PASS_ML_PP_THRESHOLD,
    }


def apply_decision_rules(primary, half_check, ml_overlay, secondary):
    """§7 mechanical decision rules."""
    # Condition ①: mean net ret > +0.5%
    c1 = primary["mean_above_threshold"]
    # Condition ②: p < 0.05
    c2 = primary["significant"]
    # Condition ③: front/back half consistent
    c3 = half_check["consistent"]
    # Condition ④: neutral regime not negative (may be inconclusive with <5 samples)
    neutral = secondary.get("regime_neutral", {})
    if neutral.get("n", 0) < 5:
        c4 = None  # inconclusive
        c4_note = f"neutral regime n={neutral.get('n', 0)} < 5 → inconclusive (not treated as FAIL)"
    else:
        c4 = neutral.get("mean", 0) >= 0
        c4_note = f"neutral regime mean = {neutral.get('mean')}"
    # Condition ⑤: ML precision@take >= always-take + 5pp
    if "error" in ml_overlay:
        c5 = None
        c5_note = f"ML overlay error: {ml_overlay['error']}"
    else:
        c5 = ml_overlay.get("passes_5pp_gate", False)
        c5_note = f"ML pp_vs_always_take = {ml_overlay.get('pp_vs_always_take')}"

    conditions = {
        "c1_mean_above_0.5pct": c1,
        "c2_pvalue_lt_0.05": c2,
        "c3_half_half_consistent": c3,
        "c4_neutral_not_negative": c4,
        "c4_note": c4_note,
        "c5_ml_precision_plus5pp": c5,
        "c5_note": c5_note,
    }

    # §7 PIVOT/KILL: mean <= 0 or significantly negative
    if primary["mean_net_ret"] <= 0:
        verdict = "PIVOT_KILL"
        reason = "Holdout cost-adjusted mean <= 0"
    elif not c1:
        verdict = "ITERATE"
        reason = f"Mean ({primary['mean_net_ret']:.4f}) below +0.5% threshold"
    elif not c2:
        verdict = "ITERATE"
        reason = f"p-value ({primary['p_value_one_tailed']:.4f}) not significant (α=0.05)"
    elif not c3:
        verdict = "ITERATE"
        reason = "Front/back half inconsistent (direction flip)"
    elif c4 is False:
        verdict = "ITERATE"
        reason = f"Neutral regime negative: {c4_note}"
    else:
        # c4 passed or inconclusive; c5 determines ML-only vs rule+ML
        if c5 is True:
            verdict = "PASS"
            reason = "All conditions met including ML overlay"
        elif c5 is False:
            verdict = "PASS_RULE_ONLY"
            reason = f"Rule-based PASS but ML overlay fails 5pp gate ({c5_note})"
        else:
            verdict = "PASS_RULE_ONLY"
            reason = f"Rule-based PASS; ML overlay inconclusive ({c5_note})"

    return verdict, reason, conditions


def main():
    parser = argparse.ArgumentParser(description="GATE-EDGE holdout test")
    parser.add_argument("--signals", default=str(DEFAULT_SIGNALS))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    print("=== GATE-EDGE: Pre-registered holdout test ===")
    print(f"Signals: {args.signals}")
    print(f"Freeze: {FREEZE_FILE}")
    print()

    freeze = load_freeze()
    cost = freeze["cost_assumption_bps"] / 10000.0
    holdout_date_gte = freeze["holdout"]["signal_date_gte"]

    df = pd.read_csv(args.signals, low_memory=False)
    df["signal_date"] = df["signal_date"].astype(str)

    holdout = df[df["signal_date"] >= holdout_date_gte].copy().sort_values("signal_date").reset_index(drop=True)
    trainval = df[df["signal_date"] < holdout_date_gte].copy()

    print(f"Train/val: {len(trainval)} signals")
    print(f"Holdout:   {len(holdout)} signals ({holdout['signal_date'].min()} → {holdout['signal_date'].max()})")
    print(f"Cost:      {freeze['cost_assumption_bps']}bps = {cost:.4f}")
    print()

    # Compute net return
    holdout["net_ret"] = holdout["ret5d_vs_spy"] - cost
    net_ret = holdout["net_ret"].values

    print("--- Primary test ---")
    primary = run_primary_test(net_ret)
    print(f"  n:              {primary['n']}")
    print(f"  Mean net ret:   {primary['mean_net_ret']:.4f} ({primary['mean_net_ret']*100:.2f}%)")
    print(f"  95% CI:         [{primary['ci_95_lo']:.4f}, {primary['ci_95_hi']:.4f}]")
    print(f"  p-value (H0: mean<=0): {primary['p_value_one_tailed']:.4f}")
    print(f"  Significant (α=0.05):  {primary['significant']}")
    print(f"  Mean > +0.5%:          {primary['mean_above_threshold']}")
    print()

    print("--- Front/back half consistency ---")
    half_check = run_half_consistency(net_ret, holdout["signal_date"])
    print(f"  First half  (n={half_check['first_half_n']}): mean = {half_check['first_half_mean']:.4f}")
    print(f"  Second half (n={half_check['second_half_n']}): mean = {half_check['second_half_mean']:.4f}")
    print(f"  Consistent (both positive): {half_check['consistent']}")
    print()

    print("--- Secondary slices (BH-corrected) ---")
    secondary = run_secondary_slices(holdout, cost)
    for k, v in secondary.items():
        n = v.get("n", "?")
        mean = v.get("mean")
        p = v.get("p_value")
        bh_sig = v.get("bh_significant")
        note = v.get("note", "")
        if mean is not None:
            print(f"  {k:35s} n={n:3d}  mean={mean:+.4f}  p={p:.4f}  BH-sig={bh_sig}  {note}")
        else:
            print(f"  {k:35s} n={n:3d}  {note}")
    print()

    print("--- ML overlay (v1.0.1_ef58f809, threshold=0.48) ---")
    ml_overlay = run_ml_overlay(holdout, freeze)
    if "error" in ml_overlay:
        print(f"  ERROR: {ml_overlay['error']}")
    else:
        print(f"  n_holdout_matched:  {ml_overlay['n_holdout_matched']}")
        print(f"  n_take:             {ml_overlay['n_take']} ({ml_overlay['take_rate']*100:.1f}%)")
        print(f"  always-take prec:   {ml_overlay['always_take_precision']:.4f}")
        print(f"  ML prec@take:       {ml_overlay['ml_precision_at_take']:.4f}")
        print(f"  pp vs always-take:  {ml_overlay['pp_vs_always_take']:+.4f}")
        print(f"  Passes 5pp gate:    {ml_overlay['passes_5pp_gate']}")
    print()

    print("--- §7 Decision ---")
    verdict, reason, conditions = apply_decision_rules(primary, half_check, ml_overlay, secondary)
    print(f"  VERDICT: {verdict}")
    print(f"  REASON:  {reason}")
    for k, v in conditions.items():
        if not k.endswith("_note"):
            print(f"    {k}: {v}")
        elif conditions.get(k.replace("_note", "")) in (None, False):
            print(f"    {k}: {v}")
    print()

    result = {
        "created_at": "2026-06-23",
        "holdout_definition": freeze["holdout"],
        "cost_bps": freeze["cost_assumption_bps"],
        "promoted_model": freeze["promoted_model"],
        "primary_test": primary,
        "half_consistency": half_check,
        "secondary_slices": secondary,
        "ml_overlay": ml_overlay,
        "decision_conditions": conditions,
        "verdict": verdict,
        "verdict_reason": reason,
        "caveat": "A-lite universe: delisting bias not corrected (Yahoo has no delisted prices). PASS does not eliminate this residual bias.",
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    class _Encoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, (np.bool_, np.integer)):
                return bool(obj) if isinstance(obj, np.bool_) else int(obj)
            if isinstance(obj, np.floating):
                return float(obj)
            return super().default(obj)

    with open(out_path, "w") as f:
        json.dump(result, f, indent=2, cls=_Encoder)
    print(f"Result written to {out_path}")

    return 0 if verdict in ("PASS", "PASS_RULE_ONLY") else 1


if __name__ == "__main__":
    sys.exit(main())
