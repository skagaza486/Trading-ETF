"""
Triple-Barrier Method labeling for meta-labeling model training.

Uses the MFE/MAE data already settled in D1 to approximate barrier touch order.
This avoids needing tick/intraday data.

Barrier definitions (applied to the 5-day window):
  Upper  (+1): mfe5d  >=  k * atr_at_signal  (price reached profit target)
  Lower  (-1): mae5d  <= -k * atr_at_signal  (price hit stop-loss)
  Vertical (0): neither barrier hit within 5 days

When both barriers are breached, we approximate "which hit first" by comparing
|mfe5d| vs |mae5d| — whichever is larger is assumed to have been touched first.

Usage:
    python label.py [--in data/signals.csv] [--k 1.5] [--out data/labeled.csv]

Outputs the original DataFrame with an added column `tb_label` (int: -1, 0, 1).
"""
import argparse
import pathlib
import sys
import pandas as pd
import numpy as np


def triple_barrier_label(df: pd.DataFrame, k: float = 1.5) -> pd.DataFrame:
    df = df.copy()
    # mfe5d / mae5d are fractional returns (e.g. 0.05 = 5%).
    # atr_at_signal is in dollar terms → convert to fraction using close_at_signal.
    atr_dollars = df["atrAtSignal"].fillna(0) if "atrAtSignal" in df.columns else df["atr_at_signal"].fillna(0)
    if "close_at_signal" in df.columns:
        close = df["close_at_signal"].replace(0, float("nan"))
        atr = (atr_dollars / close).fillna(0)
    else:
        atr = atr_dollars  # legacy: assume same units (will warn caller)
    mfe = df["mfe5d"].fillna(0)
    mae = df["mae5d"].fillna(0)   # already negative in the API

    upper_hit = mfe >=  k * atr
    lower_hit = mae <= -k * atr

    label = pd.Series(0, index=df.index, dtype=int)
    # Both hit: whichever excursion is larger wins
    both = upper_hit & lower_hit
    label[both & (mfe.abs() >= mae.abs())] = 1
    label[both & (mfe.abs() <  mae.abs())] = -1
    # Single barrier
    label[upper_hit & ~lower_hit] = 1
    label[~upper_hit & lower_hit] = -1

    df["tb_label"] = label
    return df


def feature_cols(df: pd.DataFrame) -> list[str]:
    # Only at-signal-time features — NO forward returns or MFE/MAE (leakage).
    # Full feature list lives in feature_schema.json; this is a minimal sanity check.
    candidates = [
        "rvol", "rsi14", "rs_rank", "rs_vs_spy", "clv",
        "ema50_slope", "atr_at_signal",
    ]
    return [c for c in candidates if c in df.columns]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in",  dest="input",  default="data/signals.csv")
    ap.add_argument("--k",   type=float,    default=1.5,
                    help="ATR multiplier for barrier width (default 1.5)")
    ap.add_argument("--out", default="data/labeled.csv")
    args = ap.parse_args()

    src = pathlib.Path(args.input)
    if not src.exists():
        print(f"Input not found: {src}\nRun fetch_signals.py first.", file=sys.stderr)
        sys.exit(1)

    df = pd.read_csv(src, parse_dates=["signal_date"])

    required = ["mfe5d", "mae5d"]
    if "atrAtSignal" not in df.columns and "atr_at_signal" not in df.columns:
        required.append("atrAtSignal")  # will trigger missing error with helpful name
    missing = [c for c in required if c not in df.columns]
    if missing:
        print(f"Missing columns for labeling: {missing}", file=sys.stderr)
        sys.exit(1)

    df = triple_barrier_label(df, k=args.k)

    dist = df["tb_label"].value_counts().sort_index()
    print(f"Triple-Barrier labels (k={args.k}):")
    for lbl, cnt in dist.items():
        pct = cnt / len(df) * 100
        name = {1: "UPPER (+1)", 0: "VERTICAL (0)", -1: "LOWER (-1)"}.get(int(lbl), str(lbl))
        print(f"  {name}: {cnt:,}  ({pct:.1f}%)")

    fcols = feature_cols(df)
    print(f"\nFeature columns available for training: {fcols}")
    print(f"Total labeled rows: {len(df):,}")

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"Saved → {out}")


if __name__ == "__main__":
    main()
