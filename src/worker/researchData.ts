import type { WatchlistStock } from '../data/watchlist'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any

// SEC EDGAR — free, no API key required. Rate limit: 10 req/s.
const SEC_USER_AGENT = 'trading-etf-app/1.0 skagaza486@gmail.com'

type SecTickerEntry = { cik_str: number; ticker: string }

type SecSubmissionsResponse = {
  filings: {
    recent: {
      form: string[]
      filingDate: string[]
      items: string[]
    }
  }
}

export type HistoricalEarningsPayload = Array<{
  ticker: string
  dates: string[]
}>

export type UniverseSnapshotPayload = Array<{
  snapshotMonth: string
  effectiveDate: string
  tickers: WatchlistStock[]
}>

export type UniverseSnapshotTimelineEntry = {
  snapshotMonth: string
  effectiveDate: string
  tickers: Set<string>
}

function isoDateDaysAgo(daysAgo: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
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

// Replaces Finnhub calendar/earnings. SEC Edgar 8-K item 2.02 filings are the
// official earnings announcement disclosures — same-day as the press release.
// apiKey retained for backward-compat but ignored (SEC Edgar is free).
export async function fetchHistoricalEarningsMapNode(
  symbols: string[],
  _apiKey?: string,
  fromDate = isoDateDaysAgo(365 * 2),
  toDate = new Date().toISOString().slice(0, 10)
): Promise<Map<string, string[]>> {
  const uniqueSymbols = [...new Set(symbols)]
  const emptyMap = new Map(uniqueSymbols.map(s => [s, [] as string[]]))

  let cikMap: Map<string, number>
  try {
    cikMap = await fetchSecCikMap()
  } catch (err) {
    console.warn('[SEC Edgar] CIK map fetch failed:', err instanceof Error ? err.message : String(err))
    return emptyMap
  }

  const fromMs = new Date(fromDate).getTime()
  const toMs = new Date(toDate).getTime()

  const results = await mapWithConcurrency(uniqueSymbols, 3, async (symbol): Promise<readonly [string, string[]]> => {
    const cik = cikMap.get(symbol.toUpperCase())
    if (!cik) return [symbol, []]
    // Stay under SEC's 10 req/s limit across 3 concurrent workers
    await new Promise<void>(resolve => setTimeout(resolve, 350))
    try {
      const dates = await fetchEarningsByEightK(cik, fromMs, toMs)
      return [symbol, dates]
    } catch {
      return [symbol, []]
    }
  })

  return new Map(results)
}

export function serializeHistoricalEarningsMap(historicalEarnings: Map<string, string[]>): HistoricalEarningsPayload {
  return [...historicalEarnings.entries()]
    .map(([ticker, dates]) => ({ ticker, dates: [...new Set(dates)].sort() }))
    .sort((left, right) => left.ticker.localeCompare(right.ticker))
}

export async function writeEarningsCalendarToD1(
  db: D1Database,
  historicalEarnings: HistoricalEarningsPayload
): Promise<number> {
  if (historicalEarnings.length === 0) return 0

  const rows = historicalEarnings.flatMap(({ ticker, dates }) =>
    [...new Set(dates)]
      .filter(date => typeof date === 'string' && date.length === 10)
      .map(date => ({ ticker, date }))
  )

  if (rows.length === 0) return 0

  const CHUNK = 100
  for (let index = 0; index < rows.length; index += CHUNK) {
    const slice = rows.slice(index, index + CHUNK)
    await db.batch(
      slice.map(row =>
        db.prepare(
          `INSERT OR REPLACE INTO earnings_calendar
            (ticker, earnings_date, source, updated_at)
           VALUES (?, ?, 'finnhub', datetime('now'))`
        ).bind(row.ticker, row.date)
      )
    )
  }

  return rows.length
}

export async function readHistoricalEarningsMapFromD1(
  db: D1Database,
  tickers: string[]
): Promise<Map<string, string[]>> {
  const uniqueTickers = [...new Set(tickers)]
  const earningsMap = new Map(uniqueTickers.map(ticker => [ticker, [] as string[]]))

  if (uniqueTickers.length === 0) return earningsMap

  const placeholders = uniqueTickers.map(() => '?').join(', ')

  try {
    const { results } = await db.prepare(
      `SELECT ticker, earnings_date
       FROM earnings_calendar
       WHERE ticker IN (${placeholders})
       ORDER BY ticker, earnings_date ASC`
    ).bind(...uniqueTickers).all()

    for (const row of results as Array<{ ticker?: string; earnings_date?: string }>) {
      if (!row.ticker || !row.earnings_date) continue
      const dates = earningsMap.get(row.ticker) ?? []
      dates.push(row.earnings_date)
      earningsMap.set(row.ticker, dates)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('earnings_calendar')) throw error
  }

  return earningsMap
}

export async function writeUniverseSnapshotToD1(
  db: D1Database,
  snapshotDate: string,
  watchlist: WatchlistStock[]
): Promise<number> {
  return writeUniverseSnapshotBatchToD1(db, [{
    snapshotMonth: monthKey(snapshotDate),
    effectiveDate: snapshotDate,
    tickers: watchlist,
  }])
}

export async function writeUniverseSnapshotBatchToD1(
  db: D1Database,
  snapshots: UniverseSnapshotPayload
): Promise<number> {
  const rows = snapshots.flatMap(snapshot =>
    snapshot.tickers.map(stock => ({
      snapshotMonth: snapshot.snapshotMonth,
      effectiveDate: snapshot.effectiveDate,
      ticker: stock.ticker,
      name: stock.name,
      sector: stock.sector,
      tier: stock.tier
    }))
  )

  if (rows.length === 0) return 0

  const CHUNK = 100
  for (let index = 0; index < rows.length; index += CHUNK) {
    const slice = rows.slice(index, index + CHUNK)
    await db.batch(
      slice.map(row =>
        db.prepare(
          `INSERT OR REPLACE INTO watchlist_universe_snapshots
            (snapshot_month, effective_date, ticker, name, sector, tier, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'repo_watchlist', datetime('now'))`
        ).bind(row.snapshotMonth, row.effectiveDate, row.ticker, row.name, row.sector, row.tier)
      )
    )
  }

  return rows.length
}

export async function readUniverseSnapshotMembershipFromD1(
  db: D1Database,
  snapshotMonths: string[]
): Promise<Map<string, Set<string>>> {
  const uniqueMonths = [...new Set(snapshotMonths)].filter(Boolean)
  const membership = new Map(uniqueMonths.map(month => [month, new Set<string>()]))

  if (uniqueMonths.length === 0) return membership

  const placeholders = uniqueMonths.map(() => '?').join(', ')
  try {
    const { results } = await db.prepare(
      `SELECT snapshot_month, ticker
       FROM watchlist_universe_snapshots
       WHERE snapshot_month IN (${placeholders})`
    ).bind(...uniqueMonths).all()

    for (const row of results as Array<{ snapshot_month?: string; ticker?: string }>) {
      if (!row.snapshot_month || !row.ticker) continue
      const tickers = membership.get(row.snapshot_month) ?? new Set<string>()
      tickers.add(row.ticker)
      membership.set(row.snapshot_month, tickers)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('watchlist_universe_snapshots')) throw error
  }

  return membership
}

export async function readUniverseSnapshotTimelineFromD1(
  db: D1Database
): Promise<UniverseSnapshotTimelineEntry[]> {
  try {
    const { results } = await db.prepare(
      `SELECT snapshot_month, effective_date, ticker
       FROM watchlist_universe_snapshots
       ORDER BY snapshot_month ASC, ticker ASC`
    ).all()

    const byMonth = new Map<string, UniverseSnapshotTimelineEntry>()
    for (const row of results as Array<{ snapshot_month?: string; effective_date?: string; ticker?: string }>) {
      if (!row.snapshot_month || !row.effective_date || !row.ticker) continue
      const existing = byMonth.get(row.snapshot_month) ?? {
        snapshotMonth: row.snapshot_month,
        effectiveDate: row.effective_date,
        tickers: new Set<string>()
      }
      existing.tickers.add(row.ticker)
      byMonth.set(row.snapshot_month, existing)
    }

    return [...byMonth.values()].sort((left, right) => left.snapshotMonth.localeCompare(right.snapshotMonth))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('watchlist_universe_snapshots')) return []
    throw error
  }
}

export function normalizeUniverseSnapshotPayload(
  snapshots: UniverseSnapshotPayload
): UniverseSnapshotPayload {
  return snapshots
    .map(snapshot => ({
      snapshotMonth: snapshot.snapshotMonth,
      effectiveDate: snapshot.effectiveDate,
      tickers: [...snapshot.tickers].sort((left, right) => left.ticker.localeCompare(right.ticker))
    }))
    .sort((left, right) => left.snapshotMonth.localeCompare(right.snapshotMonth))
}
