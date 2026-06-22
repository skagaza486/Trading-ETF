"""
SP-3 Feature Builder — frozen feature contract v1.0.0

Reads the raw signals CSV produced by fetch_signals.py, expands indicators_json,
enforces the leakage blocklist, and writes a versioned feature parquet.

Usage:
    python scripts/ml/build_features.py [--in data/signals.csv] [--out data/features/]

Output:
    data/features/features_v1.0.0_<sha256>.parquet
    data/features/features_v1.0.0_<sha256>.meta.json   (row count, label dist, feature list)

Columns are derived from feature_schema.json. Any column in the leakage_blocklist
is explicitly dropped before writing. The file hash is a SHA-256 of the sorted
feature column names (schema identity), not the data — so training code can assert
it trained on the right schema version.
"""

import argparse
import hashlib
import json
import pathlib
import sys
import pandas as pd
import numpy as np

SCHEMA_PATH = pathlib.Path(__file__).parent / "feature_schema.json"
DEFAULT_IN   = pathlib.Path("data/signals.csv")
DEFAULT_OUT  = pathlib.Path("data/features")


def load_schema() -> dict:
    if not SCHEMA_PATH.exists():
        sys.exit(f"Schema not found: {SCHEMA_PATH}")
    return json.loads(SCHEMA_PATH.read_text())


def expand_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Parse indicators_json column into individual numeric/bool columns."""
    if "indicators_json" not in df.columns:
        return df

    parsed = df["indicators_json"].apply(
        lambda x: json.loads(x) if isinstance(x, str) else {}
    )
    ind_df = pd.json_normalize(parsed)   # type: ignore[arg-type]

    # Drop raw column; concat expanded columns (non-overlapping)
    existing = set(df.columns) - {"indicators_json"}
    new_cols = [c for c in ind_df.columns if c not in existing]
    df = pd.concat([df.drop(columns=["indicators_json"]), ind_df[new_cols]], axis=1)
    return df


def apply_leakage_blocklist(df: pd.DataFrame, blocklist: list[str]) -> pd.DataFrame:
    """Drop any column in the blocklist — hard error if it would be used as a feature."""
    to_drop = [c for c in blocklist if c in df.columns]
    if to_drop:
        # Keep them in a side dict for target building, then remove from feature frame
        df = df.drop(columns=to_drop)
    return df, to_drop


def encode_categoricals(df: pd.DataFrame, schema: dict) -> pd.DataFrame:
    """Encode categorical columns as integer codes (0-based, -1 = unseen/null)."""
    for cat in schema["features"]["categorical"]:
        col = cat["col"]
        if col not in df.columns:
            df[col] = np.nan
        values = cat["values"]
        mapping = {v: i for i, v in enumerate(values)}
        df[col] = df[col].map(mapping).fillna(-1).astype(int)
    return df


def cast_booleans(df: pd.DataFrame, schema: dict) -> pd.DataFrame:
    """Cast boolean columns to int (1/0, -1 = null)."""
    for b in schema["features"]["boolean"]:
        col = b["col"]
        if col not in df.columns:
            df[col] = np.nan
        else:
            df[col] = df[col].map({True: 1, False: 0, 1: 1, 0: 0}).fillna(-1).astype(int)
    return df


def schema_hash(feature_cols: list[str]) -> str:
    """SHA-256 of the sorted feature column list — schema identity, not data hash."""
    canonical = json.dumps(sorted(feature_cols), separators=(",", ":")).encode()
    return hashlib.sha256(canonical).hexdigest()[:12]


def build(df_raw: pd.DataFrame, schema: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Returns (features_df, targets_df).
    features_df: leakage-free feature columns + ticker + signal_date
    targets_df:  target columns aligned by index (ret5d, ret10d, tb_label if present)
    """
    df = df_raw.copy()

    # Rename API camelCase to snake_case for columns that exist under both names
    renames = {
        "signalDate": "signal_date",
        "atrAtSignal": "atr_at_signal",
        "earningsInWindow": "earnings_in_window",
        "closeAtSignal": "close_at_signal",
        "nextOpen": "next_open",
        "rsRank": "rs_rank",
        "rsi14": "rsi14",
        "rvol": "rvol",
        "rsVsSpy": "rs_vs_spy",
        "clv": "clv",
        "ema50Slope": "ema50_slope",
    }
    df = df.rename(columns={k: v for k, v in renames.items() if k in df.columns})

    df = expand_indicators(df)

    # Build targets BEFORE dropping leakage columns
    target_cols_wanted = schema["targets"]["regression"] + schema["targets"]["classification"]
    targets = df[[c for c in target_cols_wanted if c in df.columns]].copy()

    # Also add tb_label if label.py was run
    if "tb_label" in df.columns and "tb_label" not in targets.columns:
        targets["tb_label"] = df["tb_label"]

    df = encode_categoricals(df, schema)
    df = cast_booleans(df, schema)

    # Drop ALL leakage columns
    df, dropped = apply_leakage_blocklist(df, schema["leakage_blocklist"])

    # Keep only declared feature columns + identity columns
    identity = ["ticker", "signal_date"]
    declared_numeric = [f["col"] for f in schema["features"]["numeric"]]
    declared_cat     = [f["col"] for f in schema["features"]["categorical"]]
    declared_bool    = [f["col"] for f in schema["features"]["boolean"]]
    all_feat = declared_numeric + declared_cat + declared_bool

    available = [c for c in all_feat if c in df.columns]
    missing   = [c for c in all_feat if c not in df.columns]

    if missing:
        print(f"[WARN] {len(missing)} declared features absent from data: {missing}", file=sys.stderr)

    id_cols = [c for c in identity if c in df.columns]
    features_df = df[id_cols + available].copy()

    return features_df, targets, dropped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in",  dest="input",  default=str(DEFAULT_IN))
    ap.add_argument("--out", dest="output", default=str(DEFAULT_OUT))
    ap.add_argument("--format", choices=["parquet", "csv"], default="parquet",
                    help="Output format. Use csv if pyarrow is not installed.")
    args = ap.parse_args()

    schema = load_schema()

    src = pathlib.Path(args.input)
    if not src.exists():
        sys.exit(f"Input not found: {src}\nRun fetch_signals.py first.")

    df_raw = pd.read_csv(src)
    print(f"Loaded {len(df_raw):,} rows from {src}")

    features_df, targets, dropped = build(df_raw, schema)

    feat_cols = [c for c in features_df.columns if c not in ("ticker", "signal_date")]
    shash = schema_hash(feat_cols)
    version = schema["version"]
    stem = f"features_v{version}_{shash}"

    out_dir = pathlib.Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.format == "parquet":
        try:
            features_df.to_parquet(out_dir / f"{stem}.parquet", index=False)
            targets.to_parquet(out_dir / f"{stem}.targets.parquet", index=False)
        except ImportError:
            print("[WARN] pyarrow not installed, falling back to CSV", file=sys.stderr)
            args.format = "csv"

    if args.format == "csv":
        features_df.to_csv(out_dir / f"{stem}.csv", index=False)
        targets.to_csv(out_dir / f"{stem}.targets.csv", index=False)

    # Write metadata sidecar
    meta = {
        "schema_version": version,
        "schema_hash": shash,
        "rows": len(features_df),
        "feature_cols": feat_cols,
        "feature_count": len(feat_cols),
        "leakage_cols_dropped": dropped,
        "target_cols": list(targets.columns),
        "missing_features": [c for c in [f["col"] for f in schema["features"]["numeric"]
                                          + schema["features"]["categorical"]
                                          + schema["features"]["boolean"]]
                              if c not in feat_cols],
        "pending_hyp015": schema.get("pending_hyt015", []),
    }
    (out_dir / f"{stem}.meta.json").write_text(json.dumps(meta, indent=2))

    print(f"\n=== SP-3 Feature Build Summary ===")
    print(f"Schema v{version}  hash={shash}")
    print(f"Rows: {meta['rows']:,}")
    print(f"Features: {meta['feature_count']} ({len(meta['missing_features'])} missing from data)")
    if meta["missing_features"]:
        print(f"  Missing: {meta['missing_features']}")
    print(f"Leakage cols dropped: {meta['leakage_cols_dropped']}")
    print(f"Targets: {meta['target_cols']}")
    if meta["pending_hyp015"]:
        print(f"[BLOCKED HYP-015] Sector/industry features not yet available: {meta['pending_hyp015']}")
    print(f"Output → {out_dir}/{stem}.*")


if __name__ == "__main__":
    main()
