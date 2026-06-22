import type { WatchlistStock } from '../data/watchlist'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any

type FinnhubEarningsResponse = {
  earningsCalendar?: Array<{
    date?: string
    symbol?: string
  }>
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

export async function fetchHistoricalEarningsMapNode(
  symbols: string[],
  apiKey: string | undefined,
  fromDate = isoDateDaysAgo(365 * 2),
  toDate = new Date().toISOString().slice(0, 10)
): Promise<Map<string, string[]>> {
  const uniqueSymbols = [...new Set(symbols)]
  const emptyMap = new Map(uniqueSymbols.map(symbol => [symbol, [] as string[]]))

  if (!apiKey) return emptyMap

  const results = await mapWithConcurrency(uniqueSymbols, 4, async (symbol): Promise<readonly [string, string[]]> => {
    const url = new URL('https://finnhub.io/api/v1/calendar/earnings')
    url.searchParams.set('from', fromDate)
    url.searchParams.set('to', toDate)
    url.searchParams.set('symbol', symbol)
    url.searchParams.set('token', apiKey)

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
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
