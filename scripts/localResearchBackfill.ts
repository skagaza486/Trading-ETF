import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { stockWatchlist } from '../src/data/watchlist.js'
import { buildForwardReturnRecord, buildHistoricalSignals } from '../src/engine/stockResearchEngine.js'
import { fetchYahooTickerHistory } from '../src/services/marketData/yahooFinanceProvider.js'
import type { TickerHistory } from '../src/types/indicator'

const execFileAsync = promisify(execFile)

const STOCK_BENCHMARK_TICKERS = ['SPY', 'QQQ', 'IWM', '^VIX', 'GLD', '2800.HK']
const FETCH_CONCURRENCY = 3
const HISTORY_RANGE = '2y'
const SIGNAL_BARS = 250
const SQL_CHUNK_SIZE = 500

// SEC EDGAR — free, no API key required. Rate limit: 10 req/s.
const SEC_USER_AGENT = 'trading-etf-app/1.0 skagaza486@gmail.com'
type SecTickerEntry = { cik_str: number; ticker: string }
type SecSubmissionsResponse = {
  filings: { recent: { form: string[]; filingDate: string[]; items: string[] } }
}

type CliOptions = {
  chunkSize: number
  startIndex: number
}

function parseArgs(argv: string[]): CliOptions {
  let chunkSize = 5
  let startIndex = 0
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--chunk-size') {
      chunkSize = Math.max(1, Number(argv[index + 1] ?? chunkSize))
      index += 1
    }
    if (arg === '--start-index') {
      startIndex = Math.max(0, Number(argv[index + 1] ?? startIndex))
      index += 1
    }
  }
  return { chunkSize, startIndex }
}


async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

function isoDateDaysAgo(daysAgo: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

async function fetchSecCikMap(): Promise<Map<string, number>> {
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`SEC CIK map failed: HTTP ${res.status}`)
  const data = await res.json() as Record<string, SecTickerEntry>
  const map = new Map<string, number>()
  for (const entry of Object.values(data)) {
    if (entry.ticker && entry.cik_str) map.set(entry.ticker.toUpperCase(), entry.cik_str)
  }
  return map
}

async function fetchEarningsByEightK(cik: number, fromMs: number, toMs: number): Promise<string[]> {
  const cikPadded = String(cik).padStart(10, '0')
  const res = await fetch(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, {
    headers: { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' }
  })
  if (!res.ok) return []

  const data = await res.json() as SecSubmissionsResponse
  const { form, filingDate, items } = data.filings.recent
  const dates: string[] = []
  for (let i = 0; i < form.length; i++) {
    if (form[i] === '8-K' && items[i]?.split(',').map(s => s.trim()).includes('2.02')) {
      const ms = new Date(filingDate[i]).getTime()
      if (ms >= fromMs && ms <= toMs) dates.push(filingDate[i])
    }
  }
  return dates.sort()
}

// SEC Edgar 8-K item 2.02 = "Results of Operations" — filed same day as earnings.
// Replaces Finnhub calendar/earnings which returned errors for 239/299 symbols.
// _apiKey retained for call-site compat but ignored.
async function fetchHistoricalEarningsMapNode(symbols: string[], _apiKey?: string): Promise<Map<string, string[]>> {
  const uniqueSymbols = [...new Set(symbols)]
  const fromMs = new Date(isoDateDaysAgo(365 * 2)).getTime()
  const toMs = Date.now()
  const emptyMap = new Map(uniqueSymbols.map(s => [s, [] as string[]]))

  let cikMap: Map<string, number>
  try {
    console.log('[SEC Edgar] Fetching CIK map…')
    cikMap = await fetchSecCikMap()
    console.log(`[SEC Edgar] CIK map loaded: ${cikMap.size} entries`)
  } catch (err) {
    console.error('[SEC Edgar] CIK map fetch failed:', err instanceof Error ? err.message : String(err))
    return emptyMap
  }

  const stats = { found: 0, missing: 0, withDates: 0, totalDates: 0 }
  const results = await mapWithConcurrency(uniqueSymbols, 3, async (symbol): Promise<readonly [string, string[]]> => {
    const cik = cikMap.get(symbol.toUpperCase())
    if (!cik) { stats.missing += 1; return [symbol, []] }
    stats.found += 1
    // Stay under SEC's 10 req/s limit (3 workers × ~3 req/s each = ~9 req/s)
    await new Promise<void>(resolve => setTimeout(resolve, 350))
    try {
      const dates = await fetchEarningsByEightK(cik, fromMs, toMs)
      if (dates.length > 0) { stats.withDates += 1; stats.totalDates += dates.length }
      return [symbol, dates]
    } catch {
      return [symbol, []]
    }
  })

  console.log(`\n=== SEC Edgar Earnings Diagnostics ===`)
  console.log(`Total symbols: ${uniqueSymbols.length}`)
  console.log(`CIK resolved: ${stats.found} | No CIK: ${stats.missing}`)
  console.log(`With earnings dates: ${stats.withDates} (total ${stats.totalDates} dates)`)
  console.log(`Avg dates/symbol (resolved): ${stats.withDates > 0 ? (stats.totalDates / stats.withDates).toFixed(1) : 0}`)
  console.log(`========================================\n`)

  return new Map(results)
}

async function fetchHistories(tickers: string[]): Promise<Record<string, TickerHistory>> {
  const results = await mapWithConcurrency(tickers, FETCH_CONCURRENCY, async ticker => {
    try {
      const history = await fetchYahooTickerHistory(ticker, { range: HISTORY_RANGE })
      return { ticker, history, ok: true as const }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Skipping ${ticker}: ${message}`)
      return { ticker, history: null, ok: false as const }
    }
  })

  return results.reduce<Record<string, TickerHistory>>((acc, result) => {
    if (result.ok && result.history) {
      acc[result.ticker] = result.history
    }
    return acc
  }, {})
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''")
}

async function runWranglerSqlFile(filePath: string): Promise<void> {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['./node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'trading-etf-db', '--remote', `--file=${filePath}`],
    { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 20 }
  )
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)
}

async function writeSqlChunks(prefix: string, statements: string[]): Promise<string[]> {
  const sqlRoot = path.join('.cache', 'research-backfill', 'sql')
  await mkdir(sqlRoot, { recursive: true })
  const files: string[] = []

  for (let index = 0; index < statements.length; index += SQL_CHUNK_SIZE) {
    const slice = statements.slice(index, index + SQL_CHUNK_SIZE)
    const filePath = path.join(sqlRoot, `${prefix}-${String(index / SQL_CHUNK_SIZE).padStart(3, '0')}.sql`)
    await writeFile(filePath, slice.join('\n'), 'utf8')
    files.push(filePath)
  }

  return files
}

function buildEarningsStatements(earningsMap: Map<string, string[]>): string[] {
  const statements: string[] = []
  for (const [ticker, dates] of earningsMap.entries()) {
    for (const date of [...new Set(dates)]) {
      statements.push(
        `INSERT OR REPLACE INTO earnings_calendar (ticker, earnings_date, source, updated_at) VALUES ('${escapeSql(ticker)}', '${escapeSql(date)}', 'finnhub', datetime('now'));`
      )
    }
  }
  return statements
}

async function processChunk(
  chunkIndex: number,
  tickers: string[],
  benchmarkHistories: Record<string, TickerHistory>,
  earningsMap: Map<string, string[]>
): Promise<number> {
  const chunkHistories = await fetchHistories(tickers)
  const availableTickers = tickers.filter(ticker => chunkHistories[ticker])
  if (availableTickers.length === 0) {
    console.warn(`Chunk ${chunkIndex + 1}: no valid histories, skipping`)
    return 0
  }

  const allHistories = { ...benchmarkHistories, ...chunkHistories }
  const chunkEarningsMap = new Map(availableTickers.map(ticker => [ticker, earningsMap.get(ticker) ?? []]))
  const signals = buildHistoricalSignals(allHistories, availableTickers, SIGNAL_BARS, chunkEarningsMap)
  const records = buildForwardReturnRecord(signals, allHistories)

  const statements = records.map(r => {
    const researchFlags = r.researchFlags.join(',')
    const stopLossHit = r.stopLossHit === null ? 'NULL' : (r.stopLossHit ? '1' : '0')
    const suggestedStopLoss = r.suggestedStopLoss === null ? 'NULL' : String(r.suggestedStopLoss)
    const atrAtSignal = r.atrAtSignal === null ? 'NULL' : String(r.atrAtSignal)
    const nextOpen = r.nextOpen === null ? 'NULL' : String(r.nextOpen)
    const ret1d = r.ret1d === null ? 'NULL' : String(r.ret1d)
    const ret3d = r.ret3d === null ? 'NULL' : String(r.ret3d)
    const ret5d = r.ret5d === null ? 'NULL' : String(r.ret5d)
    const ret10d = r.ret10d === null ? 'NULL' : String(r.ret10d)
    const ret5dVsSpy = r.ret5dVsSpy === null ? 'NULL' : String(r.ret5dVsSpy)
    const ret10dVsSpy = r.ret10dVsSpy === null ? 'NULL' : String(r.ret10dVsSpy)
    const mfe5d = r.mfe5d === null ? 'NULL' : String(r.mfe5d)
    const mae5d = r.mae5d === null ? 'NULL' : String(r.mae5d)
    const mfe10d = r.mfe10d === null ? 'NULL' : String(r.mfe10d)
    const mae10d = r.mae10d === null ? 'NULL' : String(r.mae10d)
    return `INSERT INTO signals
      (ticker, signal_date, label, regime, research_flags,
       close_at_signal, next_open, ret1d, ret3d, ret5d, ret10d,
       ret5d_vs_spy, ret10d_vs_spy,
       mfe5d, mae5d, mfe10d, mae10d,
       earnings_in_window, suggested_stop_loss, stop_loss_hit, atr_at_signal)
     VALUES ('${escapeSql(r.ticker)}', '${escapeSql(r.signalDate)}', '${escapeSql(r.label)}', '${escapeSql(r.regimeAtSignal)}', ${researchFlags ? `'${escapeSql(researchFlags)}'` : 'NULL'}, ${r.closeAtSignal}, ${nextOpen}, ${ret1d}, ${ret3d}, ${ret5d}, ${ret10d}, ${ret5dVsSpy}, ${ret10dVsSpy}, ${mfe5d}, ${mae5d}, ${mfe10d}, ${mae10d}, ${r.earningsInWindow ? 1 : 0}, ${suggestedStopLoss}, ${stopLossHit}, ${atrAtSignal})
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

  const sqlFiles = await writeSqlChunks(`signals-chunk-${String(chunkIndex).padStart(3, '0')}`, statements)
  for (const file of sqlFiles) {
    await runWranglerSqlFile(file)
  }

  return records.length
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const watchlistTickers = stockWatchlist.map(stock => stock.ticker)
  console.log(`Fetching 2y earnings archive (SEC Edgar) for ${watchlistTickers.length} tickers…`)
  const earningsMap = await fetchHistoricalEarningsMapNode(watchlistTickers)
  const earningsStatements = buildEarningsStatements(earningsMap)
  const earningsFiles = await writeSqlChunks('earnings-calendar', earningsStatements)
  for (const file of earningsFiles) {
    await runWranglerSqlFile(file)
  }

  console.log(`Fetching benchmark histories (${STOCK_BENCHMARK_TICKERS.join(', ')})…`)
  const benchmarkHistories = await fetchHistories(STOCK_BENCHMARK_TICKERS)

  let totalRecords = 0
  const totalChunks = Math.ceil(watchlistTickers.length / options.chunkSize)
  const startOffset = options.startIndex * options.chunkSize

  for (let index = startOffset; index < watchlistTickers.length; index += options.chunkSize) {
    const tickers = watchlistTickers.slice(index, index + options.chunkSize)
    const chunkIndex = Math.floor(index / options.chunkSize)
    console.log(`Processing local chunk ${chunkIndex + 1} / ${totalChunks} -> ${tickers.join(', ')}`)
    const records = await processChunk(chunkIndex, tickers, benchmarkHistories, earningsMap)
    totalRecords += records
    console.log(`Chunk ${chunkIndex + 1}: wrote ${records} records (running total ${totalRecords})`)
  }

  console.log(`Local research backfill complete: ${totalRecords} records upserted`)
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Local research backfill failed.')
  process.exitCode = 1
})
