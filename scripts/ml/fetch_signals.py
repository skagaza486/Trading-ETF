"""
Fetch D1 signals from the Worker API and save to CSV for ML training.

Usage:
    python fetch_signals.py [--days 365] [--out data/signals.csv] [--point-in-time]

The Worker endpoint returns up to 5000 rows of settled forward returns
(ret1d, ret3d, ret5d, ret10d, mfe5d, mae5d, atr_at_signal, etc.).
Only rows where ret5d IS NOT NULL are returned — i.e., the signal date
is far enough in the past that the 5-day window has closed.
"""
import argparse
import os
import sys
import pathlib
import requests
import pandas as pd

WORKER_URL = os.environ.get(
    "WORKER_URL",
    "https://trading-etf.skagaza486.workers.dev",
)


def fetch(days: int, point_in_time: bool = False) -> tuple[pd.DataFrame, dict]:
    url = f"{WORKER_URL}/api/d1/signals"
    params = {"days": days}
    if point_in_time:
        params["point_in_time"] = 1
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    # API returns { records: [...] } or list directly
    rows = data.get("records", data) if isinstance(data, dict) else data
    if not rows:
        print("No records returned", file=sys.stderr)
        return pd.DataFrame(), data if isinstance(data, dict) else {}
    df = pd.DataFrame(rows)
    df["signal_date"] = pd.to_datetime(df["signalDate"])
    df = df.drop(columns=["signalDate"], errors="ignore")
    df = df.sort_values("signal_date").reset_index(drop=True)
    return df, data if isinstance(data, dict) else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--out", default="data/signals.csv")
    ap.add_argument("--point-in-time", action="store_true")
    args = ap.parse_args()

    print(f"Fetching last {args.days} days of signals…")
    df, meta = fetch(args.days, point_in_time=args.point_in_time)
    if df.empty:
        sys.exit(1)

    print(f"Fetched {len(df)} rows  ({df['signal_date'].min().date()} → {df['signal_date'].max().date()})")
    if args.point_in_time:
        covered = meta.get("coveredMonths", [])
        exact = meta.get("exactSnapshotMonths", [])
        carry = meta.get("carryForwardSnapshotMonths", [])
        missing = meta.get("missingMonthsBeforeFirstSnapshot", [])
        print(
            "Point-in-time filter:"
            f" covered_months={len(covered)}"
            f" exact_months={len(exact)}"
            f" carry_forward_months={len(carry)}"
            f" missing_months={len(missing)}"
            f" dropped_before_first_snapshot={meta.get('droppedRowsBeforeFirstUniverseSnapshot', 0)}"
            f" dropped_not_in_universe={meta.get('droppedRowsTickerNotInUniverse', 0)}"
        )
        if missing:
            print(f"Missing snapshot months: {', '.join(missing[:12])}", file=sys.stderr)
    print(f"Columns: {list(df.columns)}")
    print(f"Label distribution:\n{df['label'].value_counts().to_string()}")

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"Saved → {out}  ({len(df)} rows)")


if __name__ == "__main__":
    main()
