"""
Fetch fundamental data (Steps 3–4 of the stock-selection funnel) into D1 `fundamentals`.

Direction: personal capital-management pivot — see docs/planning/EXECUTION_PLAN.md §4.

IMPORTANT LIMITATION (EXECUTION_PLAN §9): yfinance exposes only CURRENT / trailing-twelve-month
fundamentals — there is NO point-in-time history. So:
  • The fundamentals filter can be applied going FORWARD but cannot be backtested against history.
  • We write a SNAPSHOT-DATED row each run so we accumulate our OWN PIT series over time.
This script does NOT prove an edge; it feeds a disciplined discretionary heuristic.

What it does:
  1. Reads the PIT S&P 500 universe (latest snapshot in data/pit_sp500_snapshots.json).
  2. Fetches ROE / P/E / forward P/E / PEG / Debt-Equity / rev+earn growth / FCF / market cap /
     sector / profitability via yfinance (patient: retry + sleep, skip on failure).
  3. Emits batched `INSERT OR REPLACE` SQL to --out, loaded into D1 via:
        wrangler d1 execute trading-etf-db --remote --file=<out>

Usage:
    # Smoke test one ticker (prints parsed fields, writes 1-row SQL):
    python3 scripts/fetchFundamentals.py --ticker AAPL --out /tmp/aapl.sql

    # Full PIT universe → SQL file:
    python3 scripts/fetchFundamentals.py --out data/fundamentals_insert.sql

    # Then load into D1:
    wrangler d1 execute trading-etf-db --remote --file=data/fundamentals_insert.sql

Requires: pip install yfinance  (not currently installed in this repo's env).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import time

UNIVERSE_DEFAULT = "data/pit_sp500_snapshots.json"
OUT_DEFAULT = "data/fundamentals_insert.sql"


def load_universe(path: str) -> list[dict]:
    """Return [{ticker, sector}, ...] from the latest PIT snapshot."""
    data = json.loads(pathlib.Path(path).read_text())
    snapshots = data["snapshots"]
    latest = max(snapshots, key=lambda s: s.get("effectiveDate", s.get("snapshotMonth", "")))
    return [{"ticker": t["ticker"], "sector": t.get("sector")} for t in latest["tickers"]]


def _num(value):
    """Coerce to float or None (yfinance returns mixed types / 'Infinity')."""
    if value is None:
        return None
    try:
        f = float(value)
        if f != f or f in (float("inf"), float("-inf")):  # NaN / inf
            return None
        return f
    except (TypeError, ValueError):
        return None


def parse_info(ticker: str, info: dict, fallback_sector: str | None) -> dict:
    """Map a yfinance .info dict to our fundamentals row schema."""
    de_raw = _num(info.get("debtToEquity"))
    # yfinance reports debtToEquity in PERCENT form (e.g. 145.6 → ratio 1.456). Normalize so the
    # screener can compare directly against the 1.5 / 2.0 thresholds in EXECUTION_PLAN §4.
    debt_to_equity = de_raw / 100.0 if de_raw is not None else None
    eps = _num(info.get("trailingEps"))
    return {
        "ticker": ticker,
        "sector": info.get("sector") or fallback_sector,
        "roe": _num(info.get("returnOnEquity")),
        "pe": _num(info.get("trailingPE")),
        "forward_pe": _num(info.get("forwardPE")),
        "peg": _num(info.get("pegRatio") or info.get("trailingPegRatio")),
        "debt_to_equity": debt_to_equity,
        "revenue_growth_yoy": _num(info.get("revenueGrowth")),
        "earnings_growth_yoy": _num(info.get("earningsGrowth")),
        "free_cash_flow": _num(info.get("freeCashflow")),
        "profitable": 1 if (eps is not None and eps > 0) else 0,
        "market_cap": _num(info.get("marketCap")),
    }


def fetch_one(ticker: str, fallback_sector: str | None, retries: int, sleep_s: float) -> dict | None:
    import yfinance as yf  # lazy import so --help works without the package
    for attempt in range(retries):
        try:
            info = yf.Ticker(ticker).info
            if info and (info.get("trailingPE") is not None or info.get("marketCap") is not None):
                return parse_info(ticker, info, fallback_sector)
            return parse_info(ticker, info or {}, fallback_sector)
        except Exception as exc:  # noqa: BLE001 — yfinance raises many types
            if attempt == retries - 1:
                print(f"  ! {ticker}: failed after {retries} tries ({exc})", file=sys.stderr)
                return None
            time.sleep(sleep_s * (attempt + 1))
    return None


def _sql_val(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def row_to_sql(row: dict, as_of: str, fetched_at: str) -> str:
    cols = ("ticker", "as_of_date", "sector", "roe", "pe", "forward_pe", "peg",
            "debt_to_equity", "revenue_growth_yoy", "earnings_growth_yoy", "free_cash_flow",
            "profitable", "market_cap", "source", "fetched_at")
    vals = {**row, "as_of_date": as_of, "source": "yfinance", "fetched_at": fetched_at}
    return ("INSERT OR REPLACE INTO fundamentals (" + ", ".join(cols) + ") VALUES ("
            + ", ".join(_sql_val(vals.get(c)) for c in cols) + ");")


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch fundamentals into D1 fundamentals (via SQL file).")
    ap.add_argument("--ticker", help="Fetch a single ticker (smoke test).")
    ap.add_argument("--universe-file", default=UNIVERSE_DEFAULT)
    ap.add_argument("--out", default=OUT_DEFAULT, help="SQL output file.")
    ap.add_argument("--as-of", default=dt.date.today().isoformat(), help="PIT anchor date (ISO).")
    ap.add_argument("--limit", type=int, default=0, help="Cap number of tickers (0 = all).")
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--sleep", type=float, default=0.6, help="Seconds between tickers (rate limit).")
    args = ap.parse_args()

    if args.ticker:
        universe = [{"ticker": args.ticker.upper(), "sector": None}]
    else:
        universe = load_universe(args.universe_file)
        if args.limit:
            universe = universe[: args.limit]

    fetched_at = dt.datetime.now(dt.timezone.utc).isoformat()
    print(f"Fetching fundamentals for {len(universe)} ticker(s), as_of={args.as_of} …", file=sys.stderr)

    sql_lines: list[str] = []
    ok = 0
    for i, item in enumerate(universe, 1):
        row = fetch_one(item["ticker"], item.get("sector"), args.retries, args.sleep)
        if row is None:
            continue
        sql_lines.append(row_to_sql(row, args.as_of, fetched_at))
        ok += 1
        if args.ticker:
            print(json.dumps(row, indent=2))
        elif i % 25 == 0:
            print(f"  … {i}/{len(universe)} ({ok} ok)", file=sys.stderr)
        if not args.ticker:
            time.sleep(args.sleep)

    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    header = (f"-- fundamentals snapshot as_of={args.as_of}, {ok} rows, generated {fetched_at}\n"
              f"-- Load: wrangler d1 execute trading-etf-db --remote --file={args.out}\n")
    out_path.write_text(header + "\n".join(sql_lines) + "\n")
    print(f"Wrote {ok}/{len(universe)} rows → {args.out}", file=sys.stderr)
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
