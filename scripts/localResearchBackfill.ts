import { execFile, execFileSync } from 'node:child_process'
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

const WRANGLER = '.tools/node-v22.22.3-darwin-arm64/bin/node'
const WRANGLER_BIN = 'node_modules/.bin/wrangler'
const DB = 'trading-etf-db'

// SEC EDGAR — free, no API key required. Rate limit: 10 req/s.
const SEC_USER_AGENT = 'trading-etf-app/1.0 skagaza486@gmail.com'
type SecTickerEntry = { cik_str: number; ticker: string }
type SecSubmissionsResponse = {
  filings: { recent: { form: string[]; filingDate: string[]; items: string[] } }
}

type CliOptions = {
  chunkSize: number
  startIndex: number
  pitMode: boolean
}

function parseArgs(argv: string[]): CliOptions {
  let chunkSize = 5
  let startIndex = 0
  let pitMode = false
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
    if (arg === '--pit') {
      pitMode = true
    }
  }
  return { chunkSize, startIndex, pitMode }
}

// ── PIT universe helpers (--pit mode) ────────────────────────────────────────

type PitMembership = Map<string, Set<string>>  // month (YYYY-MM) → Set<ticker>

function d1QuerySync(sql: string): Record<string, unknown>[] {
  const args = [WRANGLER_BIN, 'd1', 'execute', DB, '--remote', '--command', sql]
  const raw = execFileSync(WRANGLER, args, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
  const match = raw.match(/\[\s*[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>[]
    // Wrangler wraps rows: [{results: [...], success: true, meta: {...}}]
    if (parsed.length > 0 && Array.isArray((parsed[0] as Record<string, unknown>)['results'])) {
      return (parsed[0] as Record<string, unknown>)['results'] as Record<string, unknown>[]
    }
    return parsed
  } catch {
    return []
  }
}

function loadPitMembership(): PitMembership {
  console.log('[PIT] Loading watchlist_universe_snapshots from D1…')
  const rows = d1QuerySync(
    'SELECT snapshot_month, ticker FROM watchlist_universe_snapshots ORDER BY snapshot_month, ticker'
  )
  const map: PitMembership = new Map()
  for (const row of rows) {
    const month = String(row['snapshot_month'])
    const ticker = String(row['ticker'])
    if (!map.has(month)) map.set(month, new Set())
    map.get(month)!.add(ticker)
  }
  const monthCount = map.size
  const tickerCount = [...map.values()].reduce((acc, s) => acc + s.size, 0)
  console.log(`[PIT] Loaded ${monthCount} months, ${tickerCount} total membership rows`)
  return map
}

function pitUnionTickers(pit: PitMembership): string[] {
  const all = new Set<string>()
  for (const tickers of pit.values()) {
    for (const t of tickers) all.add(t)
  }
  return [...all].sort()
}

function isPitMember(pit: PitMembership, ticker: string, signalDate: string): boolean {
  const month = signalDate.slice(0, 7)
  const members = pit.get(month)
  if (!members) {
    // No snapshot for this month — use nearest earlier month as fallback
    const months = [...pit.keys()].sort()
    const prior = [...months].reverse().find(m => m <= month)
    if (!prior) return false
    return pit.get(prior)!.has(ticker)
  }
  return members.has(ticker)
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

async function runWranglerSqlFile(filePath: string, retries = 3): Promise<void> {
  const { readFile } = await import('node:fs/promises')
  const content = await readFile(filePath, 'utf8')
  if (!content.trim()) {
    console.warn(`  Skipping empty SQL file: ${filePath}`)
    return
  }
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ['./node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'trading-etf-db', '--remote', `--file=${filePath}`],
        { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 20, timeout: 120_000 }
      )
      if (stdout) process.stdout.write(stdout)
      if (stderr) process.stderr.write(stderr)
      return
    } catch (err) {
      const msg = (err as Error).message ?? ''
      if (attempt < retries) {
        const delay = attempt * 5000
        console.warn(`  ⚠ Attempt ${attempt}/${retries} failed for ${filePath}: ${msg.slice(0, 120)}`)
        console.warn(`    Retrying in ${delay / 1000}s…`)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        console.error(`  ✘ All ${retries} attempts failed for ${filePath}: ${msg.slice(0, 200)}`)
        console.error(`    (continuing with remaining chunks — re-run to retry this file)`)
      }
    }
  }
}

async function writeSqlChunks(prefix: string, statements: string[]): Promise<string[]> {
  const sqlRoot = path.join('.cache', 'research-backfill', 'sql')
  await mkdir(sqlRoot, { recursive: true })
  const files: string[] = []

  for (let index = 0; index < statements.length; index += SQL_CHUNK_SIZE) {
    const slice = statements.slice(index, index + SQL_CHUNK_SIZE)
    if (slice.length === 0) continue
    const content = slice.join('\n')
    if (!content.trim()) continue
    const filePath = path.join(sqlRoot, `${prefix}-${String(index / SQL_CHUNK_SIZE).padStart(3, '0')}.sql`)
    await writeFile(filePath, content, 'utf8')
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
  earningsMap: Map<string, string[]>,
  pit?: PitMembership
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
  let records = buildForwardReturnRecord(signals, allHistories)

  if (pit) {
    const before = records.length
    records = records.filter(r => isPitMember(pit, r.ticker, r.signalDate))
    const dropped = before - records.length
    if (dropped > 0) {
      console.log(`  [PIT] Chunk ${chunkIndex + 1}: filtered out ${dropped} signals not in S&P 500 at signal_date`)
    }
  }

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

  // --pit: use S&P 500 PIT universe from D1 instead of static stockWatchlist.
  // Signals are generated for the union of all monthly members, then filtered
  // to only keep signals where the ticker was a member at signal_date.
  let pit: PitMembership | undefined
  let universeTickers: string[]

  if (options.pitMode) {
    pit = loadPitMembership()
    universeTickers = pitUnionTickers(pit)
    console.log(`[PIT] Universe: ${universeTickers.length} unique tickers across all PIT months`)
    console.log(`[PIT] Signals will be filtered by S&P 500 membership at signal_date`)
    console.log(`[PIT] ⚠️  A-lite caveat: delisting bias not corrected (Yahoo has no delisted prices)`)
  } else {
    universeTickers = stockWatchlist.map(stock => stock.ticker)
    console.log(`[watchlist] Universe: ${universeTickers.length} tickers from static stockWatchlist`)
  }

  console.log(`\nFetching 2y earnings archive (SEC Edgar) for ${universeTickers.length} tickers…`)
  const earningsMap = await fetchHistoricalEarningsMapNode(universeTickers)
  const earningsStatements = buildEarningsStatements(earningsMap)
  const earningsFiles = await writeSqlChunks('earnings-calendar', earningsStatements)
  for (const file of earningsFiles) {
    await runWranglerSqlFile(file)
  }

  console.log(`Fetching benchmark histories (${STOCK_BENCHMARK_TICKERS.join(', ')})…`)
  const benchmarkHistories = await fetchHistories(STOCK_BENCHMARK_TICKERS)

  let totalRecords = 0
  const totalChunks = Math.ceil(universeTickers.length / options.chunkSize)
  const startOffset = options.startIndex * options.chunkSize

  for (let index = startOffset; index < universeTickers.length; index += options.chunkSize) {
    const tickers = universeTickers.slice(index, index + options.chunkSize)
    const chunkIndex = Math.floor(index / options.chunkSize)
    console.log(`Processing local chunk ${chunkIndex + 1} / ${totalChunks} -> ${tickers.join(', ')}`)
    const records = await processChunk(chunkIndex, tickers, benchmarkHistories, earningsMap, pit)
    totalRecords += records
    console.log(`Chunk ${chunkIndex + 1}: wrote ${records} records (running total ${totalRecords})`)
  }

  console.log(`Local research backfill complete: ${totalRecords} records upserted`)
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Local research backfill failed.')
  process.exitCode = 1
})
