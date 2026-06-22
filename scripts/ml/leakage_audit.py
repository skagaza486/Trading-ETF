"""
SP-3 Leakage Audit — validates a feature file against feature_schema.json blocklist.

Fails (exit 1) if any leakage column is present in the feature parquet/CSV.
Also warns about declared features that are missing from the file.

Usage:
    python scripts/ml/leakage_audit.py --in data/features/features_v1.0.0_<hash>.parquet
    python scripts/ml/leakage_audit.py --in data/features/features_v1.0.0_<hash>.csv
"""

import argparse
import json
import pathlib
import sys
import pandas as pd

SCHEMA_PATH = pathlib.Path(__file__).parent / "feature_schema.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="input", required=True)
    args = ap.parse_args()

    schema = json.loads(SCHEMA_PATH.read_text())
    blocklist = set(schema["leakage_blocklist"])

    src = pathlib.Path(args.input)
    if not src.exists():
        sys.exit(f"File not found: {src}")

    if src.suffix == ".parquet":
        df = pd.read_parquet(src)
    elif src.suffix == ".csv":
        df = pd.read_csv(src, nrows=0)  # header only
    else:
        sys.exit(f"Unsupported format: {src.suffix}")

    cols = set(df.columns)

    # Hard check: leakage columns must not be present
    leaked = cols & blocklist
    if leaked:
        print(f"[FAIL] Leakage columns found in feature file: {sorted(leaked)}", file=sys.stderr)
        sys.exit(1)

    # Soft check: declared features that are missing
    declared = (
        [f["col"] for f in schema["features"]["numeric"]]
        + [f["col"] for f in schema["features"]["categorical"]]
        + [f["col"] for f in schema["features"]["boolean"]]
    )
    missing = [c for c in declared if c not in cols]

    print(f"[OK] No leakage columns found.")
    print(f"     Columns in file: {len(cols)}")
    print(f"     Declared features present: {len(declared) - len(missing)}/{len(declared)}")
    if missing:
        print(f"     [WARN] Missing declared features: {missing}")
    pending = schema.get("pending_hyt015", [])
    if pending:
        print(f"     [INFO] Sector/industry features pending HYP-015: {pending}")
    sys.exit(0)


if __name__ == "__main__":
    main()
