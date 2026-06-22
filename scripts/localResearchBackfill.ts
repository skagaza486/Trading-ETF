import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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

type FinnhubEarningsResponse = {
  earningsCalendar?: Array<{
    date?: string
    symbol?: string
  }>
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

async function readEnvLocal(): Promise<Record<string, string>> {
  try {
    const raw = await readFile('.env.local', 'utf8')
    return raw.split('\n').reduce<Record<string, string>>((env, line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return env
      const separator = trimmed.indexOf('=')
      if (separator === -1) return env
      const key = trimmed.slice(0, separator).trim()
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
      env[key] = value
      return env
    }, {})
  } catch {
    return {}
  }
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

async function fetchHistoricalEarningsMapNode(symbols: string[], apiKey: string): Promise<Map<string, string[]>> {
  const uniqueSymbols = [...new Set(symbols)]
  const fromDate = isoDateDaysAgo(365 * 2)
  const toDate = new Date().toISOString().slice(0, 10)

  const results = await mapWithConcurrency(uniqueSymbols, 4, async (symbol): Promise<readonly [string, string[]]> => {
    const url = new URL('https://finnhub.io/api/v1/calendar/earnings')
    url.searchParams.set('from', fromDate)
    url.searchParams.set('to', toDate)
    url.searchParams.set('symbol', symbol)
    url.searchParams.set('token', apiKey)

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
      })
      if (!response.ok) return [symbol, []]
      const payload = await response.json() as FinnhubEarningsResponse
      const dates = (payload.earningsCalendar ?? [])
        .filter(entry => entry.symbol === symbol && typeof entry.date === 'string')
        .map(entry => entry.date as string)
        .sort()
      return [symbol, dates]
    } catch {
      return [symbol, []]
    }
  })

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
  const envLocal = await readEnvLocal()
  const finnhubApiKey = process.env.FINNHUB_API_KEY ?? envLocal.FINNHUB_API_KEY
  if (!finnhubApiKey) throw new Error('FINNHUB_API_KEY is required in .env.local or env')

  const watchlistTickers = stockWatchlist.map(stock => stock.ticker)
  console.log(`Fetching 2y earnings archive for ${watchlistTickers.length} tickers…`)
  const earningsMap = await fetchHistoricalEarningsMapNode(watchlistTickers, finnhubApiKey)
  const earningsStatements = buildEarningsStatements(earningsMap)
  const earningsFiles = await writeSqlChunks('earnings-calendar', earningsStatements)
  for (const file of earningsFiles) {
    await runWranglerSqlFile(file)
  }

  console.log(`Fetching benchmark histories (${STOCK_BENCHMARK_TICKERS.join(', ')})…`)
  const benchmarkHistories = await fetchHistories(STOCK_BENCHMARK_TICKERS)

  let totalRecords = 0
  for (let index = options.startIndex; index < watchlistTickers.length; index += options.chunkSize) {
    const tickers = watchlistTickers.slice(index, index + options.chunkSize)
    const chunkIndex = index / options.chunkSize
    console.log(`Processing local chunk ${chunkIndex + 1} / ${Math.ceil(watchlistTickers.length / options.chunkSize)} -> ${tickers.join(', ')}`)
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
