// Surgical gap backfill: re-generate signal rows for a specific date range that the
// nightly snapshot pipeline missed (e.g. 2026-06-08 .. 2026-06-17, when the cron did
// not run for 12 calendar days). Runs in Node (no Worker Yahoo rate limit).
//
// Unlike `research:backfill-local` / runBackfillChunk, this does NOT reserve the trailing
// 10 bars — it replays classifyStock "as of" each missing market date exactly the way the
// daily cron does, so it can fill dates within ~10 trading days of today. Forward returns
// that have not landed yet are written as NULL and settle later via the nightly cron.
//
// Usage:
//   node scripts/backfillSnapshotGap.ts --from 2026-06-08 --to 2026-06-17 [--dry-run]
import { execFile, execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { stockWatchlist } from '../src/data/watchlist.js'
import { buildForwardReturnRecord } from '../src/engine/stockResearchEngine.js'
import { classifyStock } from '../src/engine/stockScreenerEngine.js'
import { classifyRegime, deriveRegimeInputsFromHistories } from '../src/engine/marketRegime.js'
import { sliceHistoryThroughDate } from '../src/engine/historyUtils.js'
import { fetchYahooTickerHistory } from '../src/services/marketData/yahooFinanceProvider.js'
import type { TickerHistory } from '../src/types/indicator'
import type { StockSignal } from '../src/types/signal'

const execFileAsync = promisify(execFile)

const STOCK_BENCHMARK_TICKERS = ['SPY', 'QQQ', 'IWM', '^VIX', 'GLD', '2800.HK']
const FETCH_CONCURRENCY = 3
const HISTORY_RANGE = '2y'
const SQL_CHUNK_SIZE = 500
const DB = 'trading-etf-db'
const WRANGLER_BIN = 'node_modules/.bin/wrangler'

type CliOptions = { from: string; to: string; dryRun: boolean }

function parseArgs(argv: string[]): CliOptions {
  let from = '2026-06-08'
  let to = '2026-06-17'
  let dryRun = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--from') { from = argv[i + 1] ?? from; i += 1 }
    else if (argv[i] === '--to') { to = argv[i + 1] ?? to; i += 1 }
    else if (argv[i] === '--dry-run') dryRun = true
  }
  return { from, to, dryRun }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next; next += 1
      results[i] = await mapper(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

async function fetchHistories(tickers: string[]): Promise<Record<string, TickerHistory>> {
  const results = await mapWithConcurrency(tickers, FETCH_CONCURRENCY, async ticker => {
    try {
      const history = await fetchYahooTickerHistory(ticker, { range: HISTORY_RANGE })
      return { ticker, history }
    } catch (error) {
      console.warn(`Skipping ${ticker}: ${error instanceof Error ? error.message : String(error)}`)
      return { ticker, history: null }
    }
  })
  return results.reduce<Record<string, TickerHistory>>((acc, r) => {
    if (r.history) acc[r.ticker] = r.history
    return acc
  }, {})
}

// Read the already-populated earnings_calendar so the earnings-in-window flag is accurate.
function loadEarningsMap(): Map<string, string[]> {
  const raw = execFileSync(
    process.execPath,
    [WRANGLER_BIN, 'd1', 'execute', DB, '--remote', '--json', '--command',
     'SELECT ticker, earnings_date FROM earnings_calendar'],
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  )
  const match = raw.match(/\[\s*[\s\S]*\]/)
  const map = new Map<string, string[]>()
  if (!match) return map
  const parsed = JSON.parse(match[0]) as Array<{ results?: Array<{ ticker: string; earnings_date: string }> }>
  const rows = parsed[0]?.results ?? []
  for (const row of rows) {
    if (!map.has(row.ticker)) map.set(row.ticker, [])
    map.get(row.ticker)!.push(row.earnings_date)
  }
  for (const dates of map.values()) dates.sort()
  return map
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''")
}

async function runWranglerSqlFile(filePath: string, retries = 3): Promise<void> {
  const content = await readFile(filePath, 'utf8')
  if (!content.trim()) return
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [WRANGLER_BIN, 'd1', 'execute', DB, '--remote', `--file=${filePath}`],
        { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 20, timeout: 120_000 }
      )
      if (stdout) process.stdout.write(stdout)
      if (stderr) process.stderr.write(stderr)
      return
    } catch (err) {
      const msg = (err as Error).message ?? ''
      if (attempt < retries) {
        console.warn(`  ⚠ Attempt ${attempt}/${retries} failed for ${filePath}: ${msg.slice(0, 120)} — retrying…`)
        await new Promise(r => setTimeout(r, attempt * 5000))
      } else {
        console.error(`  ✘ All ${retries} attempts failed for ${filePath}: ${msg.slice(0, 200)}`)
      }
    }
  }
}

async function applyStatements(statements: string[]): Promise<void> {
  const sqlRoot = path.join('.cache', 'snapshot-gap', 'sql')
  await mkdir(sqlRoot, { recursive: true })
  for (let i = 0; i < statements.length; i += SQL_CHUNK_SIZE) {
    const slice = statements.slice(i, i + SQL_CHUNK_SIZE)
    if (slice.length === 0) continue
    const filePath = path.join(sqlRoot, `gap-${String(i / SQL_CHUNK_SIZE).padStart(3, '0')}.sql`)
    await writeFile(filePath, slice.join('\n'), 'utf8')
    await runWranglerSqlFile(filePath)
  }
}

async function main(): Promise<void> {
  const { from, to, dryRun } = parseArgs(process.argv.slice(2))
  console.log(`Snapshot gap backfill: ${from} .. ${to}${dryRun ? ' (dry run)' : ''}`)

  const watchlistTickers = stockWatchlist.map(s => s.ticker)
  const earningsMap = loadEarningsMap()
  console.log(`Earnings map: ${earningsMap.size} tickers from D1`)

  console.log(`Fetching ${HISTORY_RANGE} histories (benchmarks + ${watchlistTickers.length} stocks)…`)
  const benchmarkHistories = await fetchHistories(STOCK_BENCHMARK_TICKERS)
  const stockHistories = await fetchHistories(watchlistTickers)
  const allHistories = { ...benchmarkHistories, ...stockHistories }

  // Trading dates in [from, to] are the SPY bar dates in that window.
  const spy = benchmarkHistories.SPY
  if (!spy) throw new Error('SPY history unavailable — cannot determine trading dates')
  const tradingDates = spy.bars.map(b => b.date).filter(d => d >= from && d <= to)
  console.log(`Trading dates in range: ${tradingDates.join(', ') || '(none)'}`)
  if (tradingDates.length === 0) { console.log('Nothing to backfill.'); return }

  const signals: StockSignal[] = []
  for (const date of tradingDates) {
    const sliced: Record<string, TickerHistory> = {}
    for (const [ticker, history] of Object.entries(allHistories)) {
      sliced[ticker] = sliceHistoryThroughDate(history, date)
    }
    const regime = classifyRegime(deriveRegimeInputsFromHistories(sliced))
    let perDate = 0
    for (const stock of stockWatchlist) {
      const h = sliced[stock.ticker]
      // Only emit a row if the stock actually has a bar on this exact market date.
      if (!h || h.bars[h.bars.length - 1]?.date !== date) continue
      const earningsDates = earningsMap.get(stock.ticker) ?? []
      const nextEarnings = earningsDates.find(d => d > date) ?? null
      const signal = classifyStock(h, sliced, nextEarnings, regime, stock.tier)
      if (signal.label === 'REVIEW_DATA') continue
      signals.push(signal)
      perDate += 1
    }
    console.log(`  ${date}: ${perDate} signals`)
  }

  // Forward returns computed from FULL (unsliced) histories — NULL where bars haven't landed.
  const records = buildForwardReturnRecord(signals, allHistories)
  console.log(`Total: ${signals.length} signals → ${records.length} records`)

  const statements = records.map(r => {
    const flags = r.researchFlags.join(',')
    const n = (v: number | null) => (v === null ? 'NULL' : String(v))
    const slh = r.stopLossHit === null ? 'NULL' : r.stopLossHit ? '1' : '0'
    return `INSERT INTO signals
      (ticker, signal_date, label, regime, research_flags,
       close_at_signal, next_open, ret1d, ret3d, ret5d, ret10d,
       ret5d_vs_spy, ret10d_vs_spy,
       mfe5d, mae5d, mfe10d, mae10d,
       earnings_in_window, suggested_stop_loss, stop_loss_hit, atr_at_signal)
     VALUES ('${escapeSql(r.ticker)}', '${escapeSql(r.signalDate)}', '${escapeSql(r.label)}', '${escapeSql(r.regimeAtSignal)}', ${flags ? `'${escapeSql(flags)}'` : 'NULL'}, ${r.closeAtSignal}, ${n(r.nextOpen)}, ${n(r.ret1d)}, ${n(r.ret3d)}, ${n(r.ret5d)}, ${n(r.ret10d)}, ${n(r.ret5dVsSpy)}, ${n(r.ret10dVsSpy)}, ${n(r.mfe5d)}, ${n(r.mae5d)}, ${n(r.mfe10d)}, ${n(r.mae10d)}, ${r.earningsInWindow ? 1 : 0}, ${n(r.suggestedStopLoss)}, ${slh}, ${n(r.atrAtSignal)})
     ON CONFLICT(ticker, signal_date) DO UPDATE SET
       close_at_signal = excluded.close_at_signal,
       next_open = excluded.next_open,
       ret1d = excluded.ret1d, ret3d = excluded.ret3d,
       ret5d = excluded.ret5d, ret10d = excluded.ret10d,
       ret5d_vs_spy = excluded.ret5d_vs_spy, ret10d_vs_spy = excluded.ret10d_vs_spy,
       mfe5d = excluded.mfe5d, mae5d = excluded.mae5d,
       mfe10d = excluded.mfe10d, mae10d = excluded.mae10d,
       earnings_in_window = excluded.earnings_in_window,
       suggested_stop_loss = excluded.suggested_stop_loss,
       stop_loss_hit = excluded.stop_loss_hit,
       atr_at_signal = excluded.atr_at_signal;`
  })

  if (dryRun) {
    console.log(`Dry run — ${statements.length} statements NOT applied. Sample:\n${statements[0] ?? '(none)'}`)
    return
  }
  await applyStatements(statements)
  console.log(`Gap backfill complete: ${statements.length} rows upserted across ${tradingDates.length} dates`)
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Snapshot gap backfill failed.')
  process.exitCode = 1
})
