#!/usr/bin/env python3
"""
build_pit_sp500.py — Reconstruct monthly S&P 500 PIT membership (A-lite)

Scrapes Wikipedia's S&P 500 current members + changes table, works backwards
from today's membership to produce monthly snapshots for --from → --to.

Output: data/pit_sp500_snapshots.json  (merge-file format for --merge-file injection
        into backfillUniverseSnapshotsFromGit.mjs)

Removes: inclusion bias (hand-picked 2026 hindsight watchlist backfilled)
Does NOT remove: delisting bias (Yahoo has no prices for delisted stocks)
GATE-EDGE PASS with this data must carry caveat: "delisting bias not corrected"

Usage:
    python3 scripts/ml/build_pit_sp500.py [--from 2025-04] [--to 2026-06] [--dry-run]

Requirements:
    pip install requests pandas lxml
"""

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Set

import pandas as pd
import requests

WIKIPEDIA_SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; trading-etf-research/1.0; educational-use)"
}


# ── Wikipedia fetch ───────────────────────────────────────────────────────────

def fetch_sp500_tables() -> List:
    resp = requests.get(WIKIPEDIA_SP500_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    tables = pd.read_html(resp.text, flavor="lxml")
    return tables


# ── Current members (table 0) ─────────────────────────────────────────────────

def parse_current_members(table: pd.DataFrame) -> Dict:
    """
    Returns dict[ticker -> {ticker, name, sector, tier}].
    Wikipedia table 0 columns vary slightly by scrape date; search flexibly.
    """
    cols = list(table.columns)

    def find(keywords):
        for col in cols:
            if all(k.lower() in str(col).lower() for k in keywords):
                return col
        return None

    ticker_col  = find(["symbol"]) or find(["ticker"]) or cols[0]
    name_col    = find(["security"]) or find(["company"]) or find(["name"]) or cols[1]
    sector_col  = find(["gics sector"]) or find(["sector"]) or cols[3]

    members = {}
    for _, row in table.iterrows():
        ticker = _clean_ticker(row.get(ticker_col))
        if not ticker:
            continue
        name   = _clean_str(row.get(name_col))   or ticker
        sector = _clean_str(row.get(sector_col)) or "Unknown"
        members[ticker] = {"ticker": ticker, "name": name, "sector": sector, "tier": 1}

    return members


# ── Changes table (table 1) ───────────────────────────────────────────────────

def parse_changes(table: pd.DataFrame) -> List:
    """
    Returns list of dicts: {date, month, added, added_name, removed, removed_name}.
    Wikipedia changes table has a multi-level header — flatten it first.
    """
    if isinstance(table.columns, pd.MultiIndex):
        table = table.copy()
        table.columns = [" ".join(str(c) for c in col if str(c) != "nan").strip()
                         for col in table.columns]

    cols = list(table.columns)

    def find(keywords):
        for col in cols:
            col_lower = str(col).lower()
            if all(k.lower() in col_lower for k in keywords):
                return col
        return None

    date_col         = find(["date"]) or cols[0]
    added_tick_col   = find(["added", "ticker"]) or find(["added", "symbol"])
    removed_tick_col = find(["removed", "ticker"]) or find(["removed", "symbol"])
    added_name_col   = find(["added", "security"]) or find(["added", "company"])
    removed_name_col = find(["removed", "security"]) or find(["removed", "company"])

    changes = []
    for _, row in table.iterrows():
        raw_date = str(row.get(date_col, "")).strip()
        if not raw_date or raw_date == "nan":
            continue

        change_date = _parse_date(raw_date)
        if not change_date:
            continue

        added   = _clean_ticker(row.get(added_tick_col))   if added_tick_col   else None
        removed = _clean_ticker(row.get(removed_tick_col)) if removed_tick_col else None

        if not added and not removed:
            continue

        changes.append({
            "date":         change_date,
            "month":        change_date[:7],
            "added":        added,
            "added_name":   _clean_str(row.get(added_name_col))   if added_name_col   else None,
            "removed":      removed,
            "removed_name": _clean_str(row.get(removed_name_col)) if removed_name_col else None,
        })

    return changes


# ── PIT reconstruction ────────────────────────────────────────────────────────

def build_monthly_snapshots(current_members: Dict, changes: List,
                            from_month: str, to_month: str) -> List:
    """
    Walk backwards from to_month, undoing each month's changes to reconstruct
    what the S&P 500 looked like at the end of each prior month.

    current_members = today's S&P 500 (as of to_month or later).
    """
    months = _generate_months(from_month, to_month)

    # Group changes by month
    by_month: Dict = {}
    for c in changes:
        by_month.setdefault(c["month"], []).append(c)

    # current = rolling membership state, starting at today's roster
    current: Dict = dict(current_members)
    snapshots: Dict = {}

    for month in reversed(months):
        # 1. Record end-of-month snapshot (before undoing this month's changes)
        snapshots[month] = dict(current)

        # 2. Undo this month's changes to roll back to start of this month
        #    = end of previous month
        for ch in by_month.get(month, []):
            if ch["added"] and ch["added"] in current:
                # Was added during 'month' → was NOT there before 'month'
                del current[ch["added"]]
            if ch["removed"]:
                # Was removed during 'month' → WAS there before 'month'
                t = ch["removed"]
                if t not in current:
                    current[t] = {
                        "ticker": t,
                        "name":   ch.get("removed_name") or t,
                        "sector": "Unknown",
                        "tier":   1,
                    }

    # Serialise as merge-file format
    result = []
    for month in months:
        members = snapshots.get(month, {})
        result.append({
            "snapshotMonth": month,
            "effectiveDate": _month_end_date(month),
            "tickers": sorted(
                [{"ticker": m["ticker"], "name": m["name"],
                  "sector": m["sector"], "tier": m["tier"]}
                 for m in members.values()],
                key=lambda x: x["ticker"],
            ),
        })

    return result


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean_ticker(val) -> Optional[str]:
    if val is None:
        return None
    t = str(val).strip()
    if not t or t.lower() in ("nan", "—", "-", "n/a"):
        return None
    # Wikipedia sometimes uses BRK.B; Yahoo uses BRK-B
    t = t.replace(".", "-")
    # Strip footnote markers like [1]
    t = re.sub(r"\[\d+\]", "", t).strip()
    return t or None


def _clean_str(val) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    s = re.sub(r"\[\d+\]", "", s).strip()
    return s if s and s.lower() != "nan" else None


_DATE_FMTS = ("%B %d, %Y", "%b %d, %Y", "%Y-%m-%d", "%d %B %Y", "%B %Y")

def _parse_date(raw: str) -> Optional[str]:
    raw = re.sub(r"\[\d+\]", "", raw).strip()
    for fmt in _DATE_FMTS:
        try:
            return datetime.strptime(raw[:20], fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    # Last resort: extract YYYY-MM
    m = re.search(r"(\d{4})-(\d{2})", raw)
    if m:
        return f"{m.group(1)}-{m.group(2)}-01"
    m = re.search(r"(\d{4})", raw)
    if m:
        return f"{m.group(1)}-01-01"
    return None


def _generate_months(from_month: str, to_month: str) -> List:
    months = []
    y, mo = int(from_month[:4]), int(from_month[5:7])
    ty, tmo = int(to_month[:4]), int(to_month[5:7])
    while (y, mo) <= (ty, tmo):
        months.append(f"{y:04d}-{mo:02d}")
        mo += 1
        if mo > 12:
            mo = 1
            y += 1
    return months


def _month_end_date(month: str) -> str:
    y, mo = int(month[:4]), int(month[5:7])
    if mo == 12:
        last = date(y + 1, 1, 1).toordinal() - 1
    else:
        last = date(y, mo + 1, 1).toordinal() - 1
    return date.fromordinal(last).strftime("%Y-%m-%d")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Build PIT S&P 500 monthly snapshots from Wikipedia (A-lite path)"
    )
    parser.add_argument("--from", dest="from_month", default="2025-04",
                        help="Start month YYYY-MM (default: 2025-04)")
    parser.add_argument("--to",   dest="to_month",
                        default=date.today().strftime("%Y-%m"),
                        help="End month YYYY-MM (default: current month)")
    parser.add_argument("--out",  default="data/pit_sp500_snapshots.json",
                        help="Output file path")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print summary without writing output file")
    args = parser.parse_args()

    print(f"Fetching S&P 500 page from Wikipedia…")
    try:
        tables = fetch_sp500_tables()
    except Exception as exc:
        sys.exit(f"Failed to fetch Wikipedia: {exc}")

    if len(tables) < 2:
        sys.exit(f"Expected ≥2 tables from Wikipedia, got {len(tables)}")

    print(f"Table 0 shape: {tables[0].shape}  Table 1 shape: {tables[1].shape}")

    print("Parsing current S&P 500 members (table 0)…")
    current = parse_current_members(tables[0])
    print(f"  → {len(current)} current members")

    print("Parsing S&P 500 changes (table 1)…")
    changes = parse_changes(tables[1])
    print(f"  → {len(changes)} change events total")

    target = [c for c in changes if args.from_month <= c["month"] <= args.to_month]
    print(f"  → {len(target)} changes within {args.from_month}→{args.to_month}:")
    for c in sorted(target, key=lambda x: x["date"]):
        added_str   = f"+{c['added']}"   if c["added"]   else ""
        removed_str = f"-{c['removed']}" if c["removed"] else ""
        print(f"    {c['date']}  {added_str:<12} {removed_str}")

    print(f"\nReconstructing monthly PIT snapshots {args.from_month}→{args.to_month}…")
    snapshots = build_monthly_snapshots(current, changes, args.from_month, args.to_month)

    print("\nSnapshot summary:")
    for s in snapshots:
        print(f"  {s['snapshotMonth']}  effective={s['effectiveDate']}  members={len(s['tickers'])}")

    if args.dry_run:
        print("\n[dry-run] Not writing file.")
        return

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"snapshots": snapshots}, indent=2))
    print(f"\n✓ Wrote {len(snapshots)} monthly snapshots → {out_path}")

    sp500_union = set()
    for s in snapshots:
        for t in s["tickers"]:
            sp500_union.add(t["ticker"])
    print(f"  Unique tickers across all months: {len(sp500_union)}")

    print(f"""
Next steps (A-lite):
  1. Inject into D1:
       INGEST_TOKEN=... .tools/node-v22.22.3-darwin-arm64/bin/node \\
         scripts/backfillUniverseSnapshotsFromGit.mjs \\
         --merge-file {out_path} --apply

  2. Run PIT-aware backfill:
       .tools/node-v22.22.3-darwin-arm64/bin/node --import tsx \\
         scripts/localResearchBackfill.ts --pit --chunk-size 10

  3. Re-export + re-label:
       .tools/node-v22.22.3-darwin-arm64/bin/node scripts/ml/export_signals_d1.mjs \\
         --out data/signals_full.csv
       python3 scripts/ml/label.py --in data/signals_full.csv \\
         --k 1.5 --out data/signals_labeled.csv

⚠️  A-lite caveat: delisting bias NOT corrected (Yahoo has no prices for
    delisted stocks). GATE-EDGE PASS with this data must note this limitation.
""")


if __name__ == "__main__":
    main()
