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
import { etfUniverse } from '../data/etfUniverse'
import { fetchYahooTickerHistory } from '../services/marketData/yahooFinanceProvider'
import { classifyStock } from '../engine/stockScreenerEngine'
import { classifyRegime, computeProxyWeakBreadth, deriveRegimeInputsFromHistories } from '../engine/marketRegime'
import { buildForwardReturnRecord, buildHistoricalSignals } from '../engine/stockResearchEngine'
import { buildHistoricalETFSignals, settleETFForwardReturns } from '../engine/etfReplayEngine'
import { evaluateAllGates } from '../engine/researchGate'
import { latestBar } from '../engine/historyUtils'
import type { TickerHistory } from '../types/indicator'
import type { ForwardReturnRecord } from '../types/research'
import type { LabelGateResult } from '../engine/researchGate'
import type { DailySnapshot, SectorSnapshotEntry, StockSnapshotEntry } from '../types/snapshot'
import { getStockMeta } from '../web/shared/i18n/stockNames'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any

// Benchmark tickers needed for regime + RS calculation
const BENCHMARK_TICKERS = ['SPY', 'QQQ', 'IWM', 'RSP', '^VIX', 'GLD', '2800.HK']

// Direct Yahoo base — bypasses the /api/yahoo proxy (which only works in browser)
const YAHOO_DIRECT = 'https://query1.finance.yahoo.com'

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// Fetch options for tuning batch behaviour. Worker cron uses defaults (no retry,
// fast) to stay within CPU/time limits; a patient Node runner can pass retries +
// delays to survive Yahoo rate-limiting (see scripts/build-snapshot.ts).
export type FetchTuning = {
  retries?: number       // extra attempts per item on failure
  retryDelayMs?: number  // base backoff (exponential) between retries
  batchDelayMs?: number  // pause between concurrency chunks
}

async function withRetry<T>(fn: () => Promise<T>, retries: number, delayMs: number): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn() }
    catch (e) {
      lastErr = e
      if (attempt < retries && delayMs) await sleep(delayMs * Math.pow(2, attempt))
    }
  }
  throw lastErr
}

// Fetch with concurrency cap to avoid Yahoo rate-limiting
async function fetchBatch<T>(
  items: string[],
  fn: (item: string) => Promise<T>,
  concurrency = 8,
  tuning: FetchTuning = {}
): Promise<Map<string, T | null>> {
  const { retries = 0, retryDelayMs = 0, batchDelayMs = 0 } = tuning
  const results = new Map<string, T | null>()
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      chunk.map(item => withRetry(() => fn(item), retries, retryDelayMs))
    )
    settled.forEach((result, index) => {
      results.set(chunk[index], result.status === 'fulfilled' ? result.value : null)
    })
    if (batchDelayMs && i + concurrency < items.length) await sleep(batchDelayMs)
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

function buildSnapshotPriceFields(history: TickerHistory): Pick<StockSnapshotEntry, 'prevClose' | 'recentClose'> {
  const prevClose = history.bars.length >= 2 ? history.bars[history.bars.length - 2].close : null
  const recentClose = history.bars
    .slice(-5)
    .map(bar => bar.close)
    .reverse()

  return { prevClose, recentClose }
}

function percentileRank(value: number, universe: number[]): number {
  if (universe.length === 0) return 50
  const below = universe.filter(item => item < value).length
  return Math.round((below / universe.length) * 100)
}

function computeSectorSnapshots(
  stocks: typeof stockWatchlist,
  stockHistories: Record<string, TickerHistory>
): SectorSnapshotEntry[] {
  const groups = new Map<string, { sector: string; histories: TickerHistory[] }>()

  for (const stock of stocks) {
    const history = stockHistories[stock.ticker]
    if (!history) continue
    const meta = getStockMeta(stock.ticker, stock.name)
    if (!groups.has(meta.sectorZh)) groups.set(meta.sectorZh, { sector: stock.sector, histories: [] })
    groups.get(meta.sectorZh)!.histories.push(history)
  }

  // Build raw per-sector trajectories first, then rank cross-sector per day
  const rawTrajectories = new Map<string, Array<{ lookback20: number; thrust5: number }>>()
  for (const [sectorZh, group] of groups) {
    const raw = buildRawSectorTrajectory20d(group.histories)
    if (raw.length > 0) rawTrajectories.set(sectorZh, raw)
  }
  const crossSectorTraj = buildCrossSectorTrajectories(rawTrajectories)

  const sectorEntries = Array.from(groups.entries()).map(([sectorZh, group]) => {
    const histories = group.histories
    const trend20d = buildSectorTrend20d(histories)
    const trajectory20d = crossSectorTraj.get(sectorZh) ?? []
    return {
      sectorZh,
      sector: group.sector,
      count: histories.length,
      trend20d,
      trajectory20d,
    }
  })

  return sectorEntries
}

function buildSectorTrend20d(histories: TickerHistory[]): number[] {
  const buckets = new Map<number, number[]>()

  for (const history of histories) {
    const closes = history.bars.slice(-20).map(bar => bar.close)
    if (closes.length < 2) continue
    const base = closes[0]
    if (!Number.isFinite(base) || base === 0) continue
    closes.forEach((close, index) => {
      const values = buckets.get(index) ?? []
      values.push(((close - base) / base) * 100)
      buckets.set(index, values)
    })
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, values]) => values.reduce((sum, value) => sum + value, 0) / values.length)
}

function buildRawSectorTrajectory20d(histories: TickerHistory[]): Array<{ lookback20: number; thrust5: number }> {
  const sectorReturns: Array<Array<{ lookback20: number; thrust5: number }>> = []

  for (const history of histories) {
    const bars = history.bars
    const perStock: Array<{ lookback20: number; thrust5: number }> = []
    for (let index = Math.max(20, bars.length - 20); index < bars.length; index++) {
      const current = bars[index]?.close
      const close20 = bars[index - 20]?.close
      const close5 = bars[index - 5]?.close
      if (!current || !close20 || !close5) continue
      perStock.push({
        lookback20: ((current - close20) / close20) * 100,
        thrust5: ((current - close5) / close5) * 100,
      })
    }
    if (perStock.length > 0) sectorReturns.push(perStock)
  }

  if (sectorReturns.length === 0) return []

  const sampleCount = Math.max(...sectorReturns.map(series => series.length))
  const aggregate: Array<{ lookback20: number; thrust5: number }> = []
  for (let index = 0; index < sampleCount; index++) {
    const sample = sectorReturns
      .map(series => series[index])
      .filter((value): value is { lookback20: number; thrust5: number } => Boolean(value))
    if (sample.length === 0) continue
    aggregate.push({
      lookback20: sample.reduce((sum, value) => sum + value.lookback20, 0) / sample.length,
      thrust5: sample.reduce((sum, value) => sum + value.thrust5, 0) / sample.length,
    })
  }
  return aggregate
}

// Rank each sector's 20-day lookback against ALL other sectors on the same day
// so the X-axis reflects cross-sector relative strength, not intra-sector oscillation.
function buildCrossSectorTrajectories(
  rawTrajectories: Map<string, Array<{ lookback20: number; thrust5: number }>>
): Map<string, SectorSnapshotEntry['trajectory20d']> {
  const result = new Map<string, SectorSnapshotEntry['trajectory20d']>()
  for (const key of rawTrajectories.keys()) result.set(key, [])

  if (rawTrajectories.size === 0) return result

  const maxLen = Math.max(...[...rawTrajectories.values()].map(t => t.length))

  for (let dayIdx = 0; dayIdx < maxLen; dayIdx++) {
    const dayPoints: Array<{ sectorZh: string; lookback20: number; thrust5: number }> = []
    for (const [sectorZh, traj] of rawTrajectories) {
      const point = traj[dayIdx]
      if (point) dayPoints.push({ sectorZh, ...point })
    }
    const allLookbacks = dayPoints.map(d => d.lookback20)
    for (const { sectorZh, lookback20, thrust5 } of dayPoints) {
      result.get(sectorZh)!.push({
        rs: percentileRank(lookback20, allLookbacks),
        thrust: thrust5,
      })
    }
  }

  return result
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

// Settle forward returns for existing D1 signals whose outcome bars have now landed.
// Does NOT re-run the signal classifier — just computes price returns for rows already in D1.
// Covers the last 15 days so ret5d (5d) and ret10d (10d) windows can both be settled.
export async function settleForwardReturns(
  db: D1Database,
  stockHistories: Record<string, TickerHistory>,
  benchmarks: Record<string, TickerHistory>,
  asOfDate: string
): Promise<{ count: number; records: ForwardReturnRecord[] }> {
  const since = dateMinus(asOfDate, 15)

  // Fetch existing signals that still have NULL ret5d
  const { results } = await db.prepare(
    `SELECT ticker, signal_date, label, regime, research_flags, rvol, atr_at_signal
     FROM signals WHERE signal_date >= ? AND ret5d IS NULL ORDER BY signal_date`
  ).bind(since).all() as { results: Array<Record<string, unknown>> }

  if (results.length === 0) return { count: 0, records: [] }

  const allHistories = { ...benchmarks, ...stockHistories }
  const spyHistory = allHistories['SPY']

  // Build minimal StockSignal stubs from D1 rows so buildForwardReturnRecord can work
  const signals = results.flatMap(row => {
    const history = allHistories[row.ticker as string]
    if (!history) return []
    const indicators = {
      atr: row.atr_at_signal as number | null,
      rvol: row.rvol as number | null,
    }
    return [{
      ticker: row.ticker as string,
      signalDate: row.signal_date as string,
      label: row.label as ForwardReturnRecord['label'],
      regime: (row.regime ?? 'neutral') as ForwardReturnRecord['regimeAtSignal'],
      researchFlags: row.research_flags ? (row.research_flags as string).split(',').filter(Boolean) : [],
      indicators,
      earningsWithinWindow: false,
      previousLabel: null,
      reason: '',
    }]
  })

  // Use the existing forward-return calculator (only needs signalDate + ticker)
  const records = buildForwardReturnRecordsLite(signals, allHistories, spyHistory)

  if (records.length === 0) return { count: 0, records: [] }

  const CHUNK = 100
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK)
    const stmts = chunk.map(r =>
      db.prepare(
        `UPDATE signals SET
           close_at_signal = ?, ret1d = ?, ret3d = ?, ret5d = ?, ret10d = ?,
           ret5d_vs_spy = ?, ret10d_vs_spy = ?,
           mfe5d = ?, mae5d = ?, mfe10d = ?, mae10d = ?,
           earnings_in_window = ?, suggested_stop_loss = ?, stop_loss_hit = ?, atr_at_signal = ?
         WHERE ticker = ? AND signal_date = ?`
      ).bind(
        r.closeAtSignal, r.ret1d, r.ret3d, r.ret5d, r.ret10d,
        r.ret5dVsSpy, r.ret10dVsSpy,
        r.mfe5d, r.mae5d, r.mfe10d, r.mae10d,
        r.earningsInWindow ? 1 : 0, r.suggestedStopLoss,
        r.stopLossHit === null ? null : r.stopLossHit ? 1 : 0,
        r.atrAtSignal,
        r.ticker, r.signalDate
      )
    )
    await db.batch(stmts)
  }

  return { count: records.length, records }
}

function dateMinus(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

// Lightweight forward-return calculator that works from bare signal stubs (no full StockSignal needed)
function buildForwardReturnRecordsLite(
  signals: Array<{ ticker: string; signalDate: string; label: ForwardReturnRecord['label']; regime: ForwardReturnRecord['regimeAtSignal']; researchFlags: string[]; indicators: { atr: number | null; rvol: number | null }; earningsWithinWindow: boolean }>,
  histories: Record<string, TickerHistory>,
  spyHistory: TickerHistory | undefined
): ForwardReturnRecord[] {
  return buildForwardReturnRecord(
    signals.map(s => ({
      ticker: s.ticker,
      signalDate: s.signalDate,
      label: s.label,
      regime: s.regime,
      researchFlags: s.researchFlags as import('../types/signal').ResearchFlag[],
      indicators: {
        ...emptyIndicators(),
        atr: s.indicators.atr,
        rvol: s.indicators.rvol,
      },
      earningsWithinWindow: s.earningsWithinWindow,
      previousLabel: undefined,
      reason: '',
    })),
    histories
  )
}

function emptyIndicators(): import('../types/signal').StockIndicatorSnapshot {
  return {
    close: 0, low: 0,
    ema20: null, ema50: null, ema150: null, ema200: null,
    ema20Slope: null, ema50Slope: null,
    rsi14: null, rsiSlope3: null, macdHistogram: null,
    rvol: null, rvolRecentAvg10: null, cmf20: null, obvSlope: null,
    clv: null, atr: null, atrSlope50: null, relStrengthVsSpy: null,
    aboveEma200: null, nearHigh52w: null, breakout20d: null, breakdown20d: null,
    priorBaseStreak: null, recentPullbackNearEma20: null, pullbackRvolAvg: null,
    extendedFromPivot: null, udVolRatio50: null, adx14: null, nr7: null,
    lowRvolDaysInWindow: null, atrCompressing: null,
    rsLine: null, rsLineEma50: null, rsLineAboveEma: null, rsLineNewHigh120d: null,
  }
}

// Write gate aggregates to gate_snapshots — one row per label for today
export async function writeGateSnapshotsToD1(
  db: D1Database,
  records: ForwardReturnRecord[],
  snapshotDate: string
): Promise<void> {
  const gateResults: LabelGateResult[] = evaluateAllGates(records)
  if (gateResults.length === 0) return

  const gateStr = (v: boolean | null): string =>
    v === true ? 'PASS' : v === false ? 'FAIL' : 'NA'

  const stmts = gateResults.map(g =>
    db.prepare(
      `INSERT INTO gate_snapshots
        (snapshot_date, label, n, avg_5d, median_5d, vs_spy, mae_5d,
         g1, g2, g3, g4, g5, g6, g7, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      snapshotDate,
      g.label,
      g.count,
      g.avgRet5d,
      g.medianRet5d,
      g.avgRet5dVsSpy,
      g.avgMae5d,
      g.gate1SampleSize ? 'PASS' : 'FAIL',
      gateStr(g.gate2Direction),
      gateStr(g.gate3VsSpy),
      gateStr(g.gate4Consistent),
      gateStr(g.gate5NeutralRegime),
      gateStr(g.gate6Mae),
      gateStr(g.gate7StopLossHitRate),
      g.status
    )
  )

  await db.batch(stmts)
}

export type DailySnapshotResult = {
  snapshot: DailySnapshot
  stockHistories: Record<string, TickerHistory>
  benchmarks: Record<string, TickerHistory>
}

export type BuildSnapshotOptions = {
  stockConcurrency?: number  // default 8 (Worker); a patient runner can lower it
  tuning?: FetchTuning       // retry/backoff; defaults to none (Worker behaviour unchanged)
}

export async function buildDailySnapshot(opts: BuildSnapshotOptions = {}): Promise<DailySnapshotResult> {
  const { stockConcurrency = 8, tuning } = opts
  const fetchOptions = { baseUrl: YAHOO_DIRECT, range: '2y' }

  // Fetch benchmarks first (needed for regime)
  const benchmarkMap = await fetchBatch(
    BENCHMARK_TICKERS,
    ticker => fetchYahooTickerHistory(ticker, fetchOptions),
    4,
    tuning
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
  const stockHistoryMap = await fetchBatch(
    stockTickers,
    ticker => fetchYahooTickerHistory(ticker, fetchOptions),
    stockConcurrency,
    tuning
  )

  const stockHistories: Record<string, TickerHistory> = {}
  for (const [ticker, history] of stockHistoryMap.entries()) {
    if (history) stockHistories[ticker] = history
  }

  // Compute signals for each stock
  const stocks: StockSnapshotEntry[] = []

  for (const stock of stockWatchlist) {
    const history = stockHistories[stock.ticker]
    if (!history) continue

    const signal = classifyStock(history, { ...benchmarks, ...stockHistories }, null, regime, stock.tier)
    const rsRank = computeRsRank(stock.ticker, stockHistoryMap)
    const { prevClose, recentClose } = buildSnapshotPriceFields(history)

    stocks.push({
      ticker: stock.ticker,
      name: stock.name,
      sector: stock.sector,
      tier: stock.tier,
      prevClose,
      recentClose,
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

  const snapshot: DailySnapshot = {
    generatedAt: new Date().toISOString(),
    date: signalDate,
    regime,
    proxyWeakBreadth,
    stocks,
    sectors: computeSectorSnapshots(stockWatchlist, stockHistories),
  }

  return { snapshot, stockHistories, benchmarks }
}

// One-time backfill: process `batchSize` stocks starting at `offset`.
// Fetches Yahoo history, replays 250-bar signal classifier, writes ForwardReturnRecords to D1.
// Call 10 times (offset 0,30,60,...,270) to cover all 299 stocks.
export async function runBackfillChunk(
  db: D1Database,
  offset: number,
  batchSize = 30
): Promise<{ offset: number; fetched: number; records: number }> {
  const fetchOptions = { baseUrl: YAHOO_DIRECT, range: '2y' }

  // Fetch benchmarks (needed for regime + RS)
  const benchmarkMap = await fetchBatch(
    BENCHMARK_TICKERS,
    ticker => fetchYahooTickerHistory(ticker, fetchOptions),
    4
  )
  const benchmarks: Record<string, TickerHistory> = {}
  for (const [ticker, history] of benchmarkMap.entries()) {
    if (history) benchmarks[ticker] = history
  }

  // Fetch this chunk of stocks
  const chunk = stockWatchlist.slice(offset, offset + batchSize)
  const chunkHistoryMap = await fetchBatch(
    chunk.map(s => s.ticker),
    ticker => fetchYahooTickerHistory(ticker, fetchOptions),
    8
  )
  const chunkHistories: Record<string, TickerHistory> = {}
  for (const [ticker, history] of chunkHistoryMap.entries()) {
    if (history) chunkHistories[ticker] = history
  }

  const allHistories = { ...benchmarks, ...chunkHistories }
  const tickers = chunk.map(s => s.ticker)

  const signals = buildHistoricalSignals(allHistories, tickers, 250)
  const records = buildForwardReturnRecord(signals, allHistories)

  if (records.length === 0) return { offset, fetched: chunk.length, records: 0 }

  const CHUNK = 100
  for (let i = 0; i < records.length; i += CHUNK) {
    const slice = records.slice(i, i + CHUNK)
    const stmts = slice.map(r =>
      db.prepare(
        `INSERT INTO signals
          (ticker, signal_date, label, regime, research_flags,
           close_at_signal, ret1d, ret3d, ret5d, ret10d,
           ret5d_vs_spy, ret10d_vs_spy,
           mfe5d, mae5d, mfe10d, mae10d,
           earnings_in_window, suggested_stop_loss, stop_loss_hit, atr_at_signal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ticker, signal_date) DO UPDATE SET
           close_at_signal = excluded.close_at_signal,
           ret1d = excluded.ret1d, ret3d = excluded.ret3d,
           ret5d = excluded.ret5d, ret10d = excluded.ret10d,
           ret5d_vs_spy = excluded.ret5d_vs_spy, ret10d_vs_spy = excluded.ret10d_vs_spy,
           mfe5d = excluded.mfe5d, mae5d = excluded.mae5d,
           mfe10d = excluded.mfe10d, mae10d = excluded.mae10d,
           earnings_in_window = excluded.earnings_in_window,
           suggested_stop_loss = excluded.suggested_stop_loss,
           stop_loss_hit = excluded.stop_loss_hit,
           atr_at_signal = excluded.atr_at_signal`
      ).bind(
        r.ticker, r.signalDate, r.label, r.regimeAtSignal,
        r.researchFlags.join(',') || null,
        r.closeAtSignal, r.ret1d, r.ret3d, r.ret5d, r.ret10d,
        r.ret5dVsSpy, r.ret10dVsSpy,
        r.mfe5d, r.mae5d, r.mfe10d, r.mae10d,
        r.earningsInWindow ? 1 : 0,
        r.suggestedStopLoss,
        r.stopLossHit === null ? null : r.stopLossHit ? 1 : 0,
        r.atrAtSignal
      )
    )
    await db.batch(stmts)
  }

  return { offset, fetched: chunk.length, records: records.length }
}

// Write current-week ETF signals to D1 (called by cron after buildDailySnapshot).
// Fetches ETF universe histories, runs current-week classification, upserts into etf_signals.
export async function writeETFSignalsToD1(
  db: D1Database,
  benchmarks: Record<string, TickerHistory>,
  snapshotDate: string
): Promise<{ written: number; settled: number }> {
  const fetchOptions = { baseUrl: YAHOO_DIRECT, range: '1y' }

  // ETF tickers not already in benchmarks
  const etfTickers = [...new Set(etfUniverse.map(e => e.ticker))]
  const missingTickers = etfTickers.filter(t => !benchmarks[t])

  const etfHistoryMap = await fetchBatch(
    missingTickers,
    ticker => fetchYahooTickerHistory(ticker, fetchOptions),
    8
  )

  const allHistories: Record<string, TickerHistory> = { ...benchmarks }
  for (const [ticker, history] of etfHistoryMap.entries()) {
    if (history) allHistories[ticker] = history
  }

  // Compute only the latest week's signal per ETF (weeksBack = 2 to get current + prior for ret1w context)
  const rows = buildHistoricalETFSignals(allHistories, etfTickers, 2)
  // Keep only the most recent row per ticker (current week)
  const latestByTicker = new Map<string, typeof rows[0]>()
  for (const row of rows) {
    const existing = latestByTicker.get(row.ticker)
    if (!existing || row.weekEndingDate > existing.weekEndingDate) {
      latestByTicker.set(row.ticker, row)
    }
  }
  const currentRows = [...latestByTicker.values()]

  if (currentRows.length > 0) {
    const stmts = currentRows.map(row =>
      db.prepare(
        `INSERT INTO etf_signals
          (ticker, week_ending_date, label, indicators_json, regime, close_at_signal, prev_close, recent_close_json, ret1w, ret4w)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ticker, week_ending_date) DO UPDATE SET
           label = excluded.label,
           indicators_json = excluded.indicators_json,
           regime = excluded.regime,
           close_at_signal = excluded.close_at_signal,
           prev_close = excluded.prev_close,
           recent_close_json = excluded.recent_close_json`
      ).bind(
        row.ticker, row.weekEndingDate, row.label,
        row.indicatorsJson, row.regime, row.closeAtSignal, row.prevClose, row.recentCloseJson,
        row.ret1w, row.ret4w
      )
    )
    for (let i = 0; i < stmts.length; i += 100) {
      await db.batch(stmts.slice(i, i + 100))
    }
  }

  // Settle forward returns for rows from the past 6 weeks
  const settled = await settleETFForwardReturns(db, allHistories, snapshotDate)

  return { written: currentRows.length, settled }
}

// One-time ETF backfill: fetch all ETF universe histories, replay N weeks, write to D1.
export async function runETFBackfill(
  db: D1Database,
  weeksBack = 52
): Promise<{ tickers: number; rows: number }> {
  const fetchOptions = { baseUrl: YAHOO_DIRECT, range: '2y' }

  const etfTickers = [...new Set(etfUniverse.map(e => e.ticker))]
  const allTickers = [...new Set([...BENCHMARK_TICKERS, ...etfTickers])]

  const historyMap = await fetchBatch(
    allTickers,
    ticker => fetchYahooTickerHistory(ticker, fetchOptions),
    6
  )

  const allHistories: Record<string, TickerHistory> = {}
  for (const [ticker, history] of historyMap.entries()) {
    if (history) allHistories[ticker] = history
  }

  const rows = buildHistoricalETFSignals(allHistories, etfTickers, weeksBack)

  if (rows.length === 0) return { tickers: 0, rows: 0 }

  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const stmts = slice.map(row =>
      db.prepare(
        `INSERT INTO etf_signals
          (ticker, week_ending_date, label, indicators_json, regime, close_at_signal, prev_close, recent_close_json, ret1w, ret4w)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ticker, week_ending_date) DO UPDATE SET
           label = excluded.label,
           indicators_json = excluded.indicators_json,
           regime = excluded.regime,
           close_at_signal = COALESCE(etf_signals.close_at_signal, excluded.close_at_signal),
           prev_close = COALESCE(etf_signals.prev_close, excluded.prev_close),
           recent_close_json = COALESCE(etf_signals.recent_close_json, excluded.recent_close_json),
           ret1w = COALESCE(excluded.ret1w, etf_signals.ret1w),
           ret4w = COALESCE(excluded.ret4w, etf_signals.ret4w)`
      ).bind(
        row.ticker, row.weekEndingDate, row.label,
        row.indicatorsJson, row.regime, row.closeAtSignal, row.prevClose, row.recentCloseJson,
        row.ret1w, row.ret4w
      )
    )
    await db.batch(stmts)
  }

  const tickers = new Set(rows.map(r => r.ticker)).size
  return { tickers, rows: rows.length }
}
