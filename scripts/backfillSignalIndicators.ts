/**
 * One-time backfill: for historical signals with NULL rs_rank / indicators_json,
 * re-fetch Yahoo history, replay classifyStock at each signal_date, then UPDATE D1.
 *
 * Targets `trading-etf-db` signals table — the same DB the snapshot pipeline writes to.
 *
 * Usage:
 *   node --import tsx scripts/backfillSignalIndicators.ts [--dry-run] [--label LONG_BREAK,LONG_VCP,LONG_BOUNCE]
 *
 * Takes ~10–20 min depending on Yahoo rate-limit behaviour. Uses retry+delay tuning
 * matched to scripts/build-snapshot.ts patient runner settings.
 */

import { stockWatchlist } from '../src/data/watchlist'
import { fetchYahooTickerHistory } from '../src/services/marketData/yahooFinanceProvider'
import { classifyStock } from '../src/engine/stockScreenerEngine'
import { classifyRegime, deriveRegimeInputsFromHistories } from '../src/engine/marketRegime'
import { sliceHistoryThroughDate } from '../src/engine/historyUtils'
import type { TickerHistory } from '../src/types/indicator'
import { execFileSync } from 'node:child_process'

const WRANGLER = '.tools/node-v22.22.3-darwin-arm64/bin/node'
const WRANGLER_BIN = 'node_modules/.bin/wrangler'
const DB = 'trading-etf-db'
const YAHOO_BASE = 'https://query1.finance.yahoo.com'
const BENCHMARK_TICKERS = ['SPY', 'QQQ', 'IWM', 'RSP', '^VIX', 'GLD', '2800.HK']
const DRY_RUN = process.argv.includes('--dry-run')

const labelArg = process.argv.find(a => a.startsWith('--label'))
const TARGET_LABELS = labelArg
  ? process.argv[process.argv.indexOf('--label') + 1].split(',')
  : ['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE']

// ── D1 helpers ───────────────────────────────────────────────────────────────

function d1Query(sql: string): Record<string, unknown>[] {
  const args = [WRANGLER_BIN, 'd1', 'execute', DB, '--remote', '--command', sql]
  const raw = execFileSync(WRANGLER, args, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
  const match = raw.match(/\[\s*\{[\s\S]*\}\s*\]/)
  if (!match) return []
  const parsed = JSON.parse(match[0]) as Array<{ results?: Record<string, unknown>[] }>
  return parsed[0]?.results ?? []
}

function d1Execute(sql: string): void {
  const args = [WRANGLER_BIN, 'd1', 'execute', DB, '--remote', '--command', sql]
  execFileSync(WRANGLER, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
}

// ── Yahoo fetch helpers ───────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function fetchWithRetry(ticker: string, retries = 3, delayMs = 2000): Promise<TickerHistory | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const h = await fetchYahooTickerHistory(ticker, { baseUrl: YAHOO_BASE, range: '2y' })
      return h
    } catch (err) {
      if (attempt < retries) {
        await sleep(delayMs * (attempt + 1))
      }
    }
  }
  return null
}

async function fetchBatchThrottled(tickers: string[], concurrency = 5, batchDelayMs = 1500): Promise<Map<string, TickerHistory | null>> {
  const results = new Map<string, TickerHistory | null>()
  for (let i = 0; i < tickers.length; i += concurrency) {
    const chunk = tickers.slice(i, i + concurrency)
    const settled = await Promise.allSettled(chunk.map(t => fetchWithRetry(t)))
    settled.forEach((r, j) => {
      results.set(chunk[j], r.status === 'fulfilled' ? r.value : null)
    })
    console.log(`  fetched ${Math.min(i + concurrency, tickers.length)}/${tickers.length}`)
    if (i + concurrency < tickers.length) await sleep(batchDelayMs)
  }
  return results
}

// ── RS rank computation (same as cronSnapshot.ts) ────────────────────────────

function computeRsRankFromSliced(ticker: string, slicedHistories: Record<string, TickerHistory>): number | null {
  const history = slicedHistories[ticker]
  if (!history || history.bars.length < 127) return null

  const targetReturn = (history.bars.at(-1)!.close - history.bars.at(-127)!.close) / history.bars.at(-127)!.close

  const allReturns: number[] = []
  for (const h of Object.values(slicedHistories)) {
    if (!h || h.bars.length < 127) continue
    const ret = (h.bars.at(-1)!.close - h.bars.at(-127)!.close) / h.bars.at(-127)!.close
    allReturns.push(ret)
  }

  if (allReturns.length === 0) return null
  const below = allReturns.filter(r => r < targetReturn).length
  return Math.round((below / allReturns.length) * 100)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSP-4 indicator backfill — labels: ${TARGET_LABELS.join(', ')}${DRY_RUN ? ' [DRY RUN]' : ''}`)

  // 1. Load signals with NULL rs_rank
  const labelList = TARGET_LABELS.map(l => `'${l}'`).join(',')
  console.log('\n[1/5] Loading signals with NULL indicators from D1…')
  const rows = d1Query(
    `SELECT ticker, signal_date, label FROM signals
     WHERE label IN (${labelList})
       AND rs_rank IS NULL
       AND ret5d IS NOT NULL
     ORDER BY signal_date`
  )

  if (rows.length === 0) {
    console.log('No signals need backfill — exiting.')
    return
  }
  console.log(`  Found ${rows.length} signals to backfill`)

  // 2. Collect unique tickers needed
  const neededTickers = new Set(rows.map(r => r.ticker as string))
  const allWatchlistTickers = stockWatchlist.map(s => s.ticker)
  // Fetch full watchlist for accurate cross-sectional RS rank
  const fetchTickers = [...new Set([...BENCHMARK_TICKERS, ...allWatchlistTickers])]

  console.log(`\n[2/5] Fetching Yahoo 2y history for ${fetchTickers.length} tickers…`)
  const historyMap = await fetchBatchThrottled(fetchTickers, 5, 1500)

  const successCount = [...historyMap.values()].filter(Boolean).length
  console.log(`  Got ${successCount}/${fetchTickers.length} histories`)

  // Build Record<string, TickerHistory> for non-null entries
  const allHistories: Record<string, TickerHistory> = {}
  for (const [t, h] of historyMap.entries()) {
    if (h) allHistories[t] = h
  }

  // 3. Group signals by date for efficient cross-sectional slicing
  const byDate = new Map<string, Array<{ ticker: string; label: string }>>()
  for (const row of rows) {
    const date = row.signal_date as string
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date)!.push({ ticker: row.ticker as string, label: row.label as string })
  }

  console.log(`\n[3/5] Computing indicators for ${byDate.size} unique signal dates…`)

  type UpdateRecord = {
    ticker: string
    signal_date: string
    rs_rank: number | null
    rsi14: number | null
    rvol: number | null
    rs_vs_spy: number | null
    clv: number | null
    ema50_slope: number | null
    indicators_json: string | null
  }

  const updates: UpdateRecord[] = []
  let datesDone = 0

  for (const [signalDate, signalsOnDate] of [...byDate.entries()].sort()) {
    // Slice all histories through signalDate
    const slicedHistories: Record<string, TickerHistory> = {}
    for (const [t, h] of Object.entries(allHistories)) {
      const sliced = sliceHistoryThroughDate(h, signalDate)
      if (sliced.bars.length > 0) slicedHistories[t] = sliced
    }

    const regime = classifyRegime(deriveRegimeInputsFromHistories(slicedHistories))

    for (const { ticker } of signalsOnDate) {
      const history = slicedHistories[ticker]
      if (!history || history.bars.length < 30) {
        console.warn(`  SKIP ${ticker} @ ${signalDate}: insufficient history (${history?.bars.length ?? 0} bars)`)
        continue
      }

      const signal = classifyStock(history, slicedHistories, null, regime)
      const rsRank = computeRsRankFromSliced(ticker, slicedHistories)
      const ind = signal.indicators

      updates.push({
        ticker,
        signal_date: signalDate,
        rs_rank: rsRank,
        rsi14: ind.rsi14 ?? null,
        rvol: ind.rvol ?? null,
        rs_vs_spy: ind.relStrengthVsSpy ?? null,
        clv: ind.clv ?? null,
        ema50_slope: ind.ema50Slope ?? null,
        indicators_json: JSON.stringify(ind),
      })
    }

    datesDone++
    if (datesDone % 20 === 0) {
      console.log(`  processed ${datesDone}/${byDate.size} dates (${updates.length} updates queued)`)
    }
  }

  console.log(`\n[4/5] Built ${updates.length} update records`)

  if (DRY_RUN) {
    console.log('\n[DRY RUN] First 3 updates:')
    for (const u of updates.slice(0, 3)) {
      console.log(JSON.stringify({ ...u, indicators_json: u.indicators_json ? '…' : null }, null, 2))
    }
    console.log('\nDry run complete — no writes made.')
    return
  }

  // 4. Write to D1 in batches (SQL UPDATE statements, 50 at a time via wrangler)
  console.log('\n[5/5] Writing updates to D1…')
  const CHUNK = 50
  let written = 0

  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK)
    // Build a multi-statement SQL string — each UPDATE is semicolon-separated
    const sql = chunk.map(u => {
      const rr = u.rs_rank === null ? 'NULL' : String(u.rs_rank)
      const rsi = u.rsi14 === null ? 'NULL' : String(u.rsi14)
      const rv = u.rvol === null ? 'NULL' : String(u.rvol)
      const rs = u.rs_vs_spy === null ? 'NULL' : String(u.rs_vs_spy)
      const clv = u.clv === null ? 'NULL' : String(u.clv)
      const slope = u.ema50_slope === null ? 'NULL' : String(u.ema50_slope)
      const ij = u.indicators_json === null ? 'NULL' : `'${u.indicators_json.replace(/'/g, "''")}'`
      return `UPDATE signals SET rs_rank=${rr}, rsi14=${rsi}, rvol=${rv}, rs_vs_spy=${rs}, clv=${clv}, ema50_slope=${slope}, indicators_json=${ij} WHERE ticker='${u.ticker}' AND signal_date='${u.signal_date}'`
    }).join('; ')

    d1Execute(sql)
    written += chunk.length
    console.log(`  wrote ${written}/${updates.length}`)
  }

  // 5. Verify
  console.log('\nVerifying…')
  const verify = d1Query(
    `SELECT COUNT(*) as total,
       SUM(CASE WHEN rs_rank IS NOT NULL THEN 1 ELSE 0 END) as has_rs_rank,
       SUM(CASE WHEN rsi14 IS NOT NULL THEN 1 ELSE 0 END) as has_rsi,
       SUM(CASE WHEN indicators_json IS NOT NULL THEN 1 ELSE 0 END) as has_indicators
     FROM signals WHERE label IN (${labelList}) AND ret5d IS NOT NULL`
  )
  console.log('Result:', JSON.stringify(verify[0]))
  console.log('\nBackfill complete.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
