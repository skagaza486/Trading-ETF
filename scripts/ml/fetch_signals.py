"""
Fetch D1 signals from the Worker API and save to CSV for ML training.

Usage:
    python fetch_signals.py [--days 365] [--out data/signals.csv]

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


def fetch(days: int) -> pd.DataFrame:
    url = f"{WORKER_URL}/api/d1/signals"
    resp = requests.get(url, params={"days": days}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    # API returns { records: [...] } or list directly
    rows = data.get("records", data) if isinstance(data, dict) else data
    if not rows:
        print("No records returned", file=sys.stderr)
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    df["signal_date"] = pd.to_datetime(df["signalDate"])
    df = df.drop(columns=["signalDate"], errors="ignore")
    df = df.sort_values("signal_date").reset_index(drop=True)
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--out", default="data/signals.csv")
    args = ap.parse_args()

    print(f"Fetching last {args.days} days of signals…")
    df = fetch(args.days)
    if df.empty:
        sys.exit(1)

    print(f"Fetched {len(df)} rows  ({df['signal_date'].min().date()} → {df['signal_date'].max().date()})")
    print(f"Columns: {list(df.columns)}")
    print(f"Label distribution:\n{df['label'].value_counts().to_string()}")

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"Saved → {out}  ({len(df)} rows)")


if __name__ == "__main__":
    main()
