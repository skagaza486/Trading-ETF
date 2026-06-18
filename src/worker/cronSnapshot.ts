/**
 * Cron snapshot builder — runs inside Cloudflare Worker on scheduled trigger.
 *
 * Fetches Yahoo Finance data directly (no proxy), computes indicators and signals
 * for the entire watchlist universe, then writes the result to Cloudflare KV.
 *
 * NOTE: Requires Workers Paid plan ($5/month) for sufficient CPU time.
 * Free tier CPU limit (10ms) is too tight for 100+ stock computations.
 */

import { stockWatchlist } from '../data/watchlist'
import { fetchYahooTickerHistory } from '../services/marketData/yahooFinanceProvider'
import { classifyStock } from '../engine/stockScreenerEngine'
import { classifyRegime, computeProxyWeakBreadth, deriveRegimeInputsFromHistories } from '../engine/marketRegime'
import { latestBar } from '../engine/historyUtils'
import type { TickerHistory } from '../types/indicator'
import type { DailySnapshot, StockSnapshotEntry } from '../types/snapshot'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any

// Benchmark tickers needed for regime + RS calculation
const BENCHMARK_TICKERS = ['SPY', 'QQQ', 'IWM', 'RSP', '^VIX', 'GLD', '2800.HK']

// Direct Yahoo base — bypasses the /api/yahoo proxy (which only works in browser)
const YAHOO_DIRECT = 'https://query1.finance.yahoo.com'

// Fetch with concurrency cap to avoid Yahoo rate-limiting
async function fetchBatch<T>(
  items: string[],
  fn: (item: string) => Promise<T>,
  concurrency = 8
): Promise<Map<string, T | null>> {
  const results = new Map<string, T | null>()
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency)
    const settled = await Promise.allSettled(chunk.map(item => fn(item)))
    settled.forEach((result, index) => {
      results.set(chunk[index], result.status === 'fulfilled' ? result.value : null)
    })
  }
  return results
}

// Compute cross-sectional RS rank (percentile, 0–100) based on 126-day return
function computeRsRank(ticker: string, histories: Map<string, TickerHistory | null>): number | null {
  const history = histories.get(ticker)
  if (!history || history.bars.length < 127) return null

  const targetReturn = (history.bars.at(-1)!.close - history.bars.at(-127)!.close) / history.bars.at(-127)!.close

  const allReturns: number[] = []
  for (const h of histories.values()) {
    if (!h || h.bars.length < 127) continue
    const ret = (h.bars.at(-1)!.close - h.bars.at(-127)!.close) / h.bars.at(-127)!.close
    allReturns.push(ret)
  }

  if (allReturns.length === 0) return null
  const below = allReturns.filter(r => r < targetReturn).length
  return Math.round((below / allReturns.length) * 100)
}

export async function writeSignalsToD1(db: D1Database, snapshot: DailySnapshot): Promise<void> {
  const stmts = snapshot.stocks.map(stock =>
    db.prepare(
      `INSERT OR REPLACE INTO signals
        (ticker, signal_date, label, previous_label, regime, rs_rank, rsi14, rvol, rs_vs_spy, clv, ema50_slope, indicators_json, research_flags, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      stock.ticker,
      snapshot.date,
      stock.label,
      stock.previousLabel ?? null,
      stock.regime,
      stock.rsRank,
      stock.indicators.rsi14,
      stock.indicators.rvol,
      stock.indicators.relStrengthVsSpy,
      stock.indicators.clv,
      stock.indicators.ema50Slope,
      JSON.stringify(stock.indicators),
      stock.researchFlags.join(',') || null,
      stock.reason
    )
  )

  // D1 batch — all inserts in one transaction
  await db.batch(stmts)
}

export async function buildDailySnapshot(): Promise<DailySnapshot> {
  const fetchOptions = { baseUrl: YAHOO_DIRECT, range: '2y' }

  // Fetch benchmarks first (needed for regime)
  const benchmarkMap = await fetchBatch(
    BENCHMARK_TICKERS,
    ticker => fetchYahooTickerHistory(ticker, fetchOptions),
    4
  )

  const benchmarks: Record<string, TickerHistory> = {}
  for (const [ticker, history] of benchmarkMap.entries()) {
    if (history) benchmarks[ticker] = history
  }

  // Derive regime + breadth from benchmarks
  const regimeInputs = deriveRegimeInputsFromHistories(benchmarks)
  const regime = classifyRegime(regimeInputs)
  const proxyWeakBreadth = computeProxyWeakBreadth(regimeInputs)

  // Fetch all watchlist stocks
  const stockTickers = stockWatchlist.map(s => s.ticker)
  const stockHistories = await fetchBatch(
    stockTickers,
    ticker => fetchYahooTickerHistory(ticker, fetchOptions),
    8
  )

  // Compute signals for each stock
  const stocks: StockSnapshotEntry[] = []

  for (const stock of stockWatchlist) {
    const history = stockHistories.get(stock.ticker)
    if (!history) continue

    const signal = classifyStock(history, benchmarks, null, regime, stock.tier)
    const rsRank = computeRsRank(stock.ticker, stockHistories)

    stocks.push({
      ticker: stock.ticker,
      name: stock.name,
      sector: stock.sector,
      tier: stock.tier,
      label: signal.label,
      previousLabel: signal.previousLabel,
      researchFlags: signal.researchFlags,
      indicators: signal.indicators,
      regime: signal.regime,
      earningsWithinWindow: signal.earningsWithinWindow,
      reason: signal.reason,
      rsRank
    })
  }

  const signalDate = latestBar(Object.values(benchmarks)[0])?.date ?? new Date().toISOString().slice(0, 10)

  return {
    generatedAt: new Date().toISOString(),
    date: signalDate,
    regime,
    proxyWeakBreadth,
    stocks
  }
}
