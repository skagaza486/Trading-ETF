import { buildDailySnapshot, writeSignalsToD1, settleForwardReturns, writeGateSnapshotsToD1, runBackfillChunk, writeETFSignalsToD1, runETFBackfill } from './src/worker/cronSnapshot'
import { stockWatchlist } from './src/data/watchlist'
import type { DailySnapshot } from './src/types/snapshot'
import type { ForwardReturnRecord } from './src/types/research'
import type { ETFSignalRow } from './src/engine/etfReplayEngine'
import {
  readUniverseSnapshotTimelineFromD1,
  writeEarningsCalendarToD1,
  writeUniverseSnapshotBatchToD1,
  writeUniverseSnapshotToD1
} from './src/worker/researchData'


const SNAPSHOT_KEY = 'snapshot:latest'

type IngestSnapshotRequest =
  | DailySnapshot
  | {
    snapshot: DailySnapshot
    historicalEarnings?: Array<{
      ticker: string
      dates: string[]
    }>
  }

type UniverseSnapshotRequest = {
  snapshots: Array<{
    snapshotMonth: string
    effectiveDate: string
    tickers: Array<{
      ticker: string
      name: string
      sector: string
      tier: 1 | 2
    }>
  }>
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/yahoo')) {
      return handleYahoo(url)
    }

    if (url.pathname.startsWith('/api/finnhub')) {
      return handleFinnhub(env, url)
    }

    if (url.pathname === '/api/snapshot/latest') {
      return handleSnapshotRead(env)
    }

    if (url.pathname === '/api/d1/signals') {
      return handleSignalsRead(env, url)
    }

    if (url.pathname === '/api/admin/backfill') {
      return handleBackfill(request, env, url)
    }

    if (url.pathname === '/api/admin/etf-backfill') {
      return handleETFBackfill(request, env, url)
    }

    // Manually trigger the same job the cron runs (cron only fires Mon–Fri 21:30 UTC).
    if (url.pathname === '/api/admin/run-snapshot') {
      return handleRunSnapshotAdmin(request, env, ctx)
    }

    // Ingest a pre-built snapshot (computed by an external batch runner, e.g. GitHub
    // Actions) and persist it via the binding write path. Lets the heavy Yahoo fetch
    // happen off-Worker where there are no subrequest/CPU limits.
    if (url.pathname === '/api/admin/ingest-snapshot') {
      return handleIngestSnapshot(request, env)
    }

    if (url.pathname === '/api/admin/universe-snapshots') {
      return handleUniverseSnapshotsIngest(request, env)
    }

    if (url.pathname === '/api/d1/etf-signals') {
      return handleETFSignalsRead(env, url)
    }

    if (url.pathname === '/api/d1/signal-stats') {
      return handleSignalStats(env, url)
    }

    if (url.pathname === '/api/d1/signal-breadth') {
      return handleSignalBreadth(env, url)
    }

    if (url.pathname === '/api/d1/ticker-history') {
      return handleTickerHistory(env, url)
    }

    if (url.pathname === '/api/d1/signal-perf-by-period') {
      return handleSignalPerfByPeriod(env, url)
    }

    if (url.pathname === '/api/d1/research-health') {
      return handleResearchHealth(env)
    }

    // Serve legacy app for /legacy and /legacy/* paths
    if (url.pathname === '/legacy' || url.pathname.startsWith('/legacy/')) {
      const legacyUrl = new URL(request.url)
      legacyUrl.pathname = '/legacy.html'
      return env.ASSETS.fetch(new Request(legacyUrl.toString(), request))
    }

    return env.ASSETS.fetch(request)
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCronSnapshot(env))
  }
}

async function runCronSnapshot(env: Env): Promise<void> {
  if (!env.SNAPSHOT_KV) {
    console.error('SNAPSHOT_KV binding not configured — skipping cron snapshot')
    return
  }

  try {
    console.log('Cron snapshot: starting...')
    const { snapshot, stockHistories, benchmarks } = await buildDailySnapshot()
    await env.SNAPSHOT_KV.put(SNAPSHOT_KEY, JSON.stringify(snapshot), {
      expirationTtl: 60 * 60 * 36  // 36h TTL — survives weekends
    })
    console.log(`Cron snapshot: done. ${snapshot.stocks.length} stocks, date=${snapshot.date}`)

    if (env.trading_etf_db) {
      // 1. Write today's signals (label + indicators)
      await writeSignalsToD1(env.trading_etf_db, snapshot)
      console.log(`Cron D1: wrote ${snapshot.stocks.length} signals for ${snapshot.date}`)

      // 1b. Persist the month-level universe roster for future point-in-time replay.
      await writeUniverseSnapshotToD1(env.trading_etf_db, snapshot.date, stockWatchlist)

      // 2. Settle forward returns for signals from the past 15 days (no re-classification)
      const { count: recordCount, records } = await settleForwardReturns(env.trading_etf_db, stockHistories, benchmarks, snapshot.date)
      console.log(`Cron D1: settled forward returns for ${recordCount} signals`)

      // 3. Write gate snapshot aggregates (one row per label, per cron run)
      await writeGateSnapshotsToD1(env.trading_etf_db, records, snapshot.date)
      console.log(`Cron D1: wrote gate snapshot for ${snapshot.date}`)

      // 4. Write current-week ETF signals + settle forward returns
      const { written: etfWritten, settled: etfSettled } = await writeETFSignalsToD1(env.trading_etf_db, benchmarks, snapshot.date)
      console.log(`Cron ETF: wrote ${etfWritten} ETF signals, settled ${etfSettled} forward returns`)
    }
  } catch (error) {
    console.error('Cron snapshot failed:', error instanceof Error ? error.message : String(error))
  }
}

function getBearerToken(request: Request): string {
  const auth = request.headers.get('Authorization') ?? ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : request.headers.get('X-Ingest-Token') ?? ''
}

function requireAdminToken(request: Request, env: Env): Response | null {
  if (!env.INGEST_TOKEN) return jsonError('INGEST_TOKEN not configured on Worker', 503)
  const token = getBearerToken(request)
  if (token !== env.INGEST_TOKEN) return jsonError('Unauthorized', 401)
  return null
}

async function handleRunSnapshot(env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.SNAPSHOT_KV) return jsonError('SNAPSHOT_KV not configured', 503)
  // Run in the background with cron-like allowances; poll /api/snapshot/latest for completion.
  ctx.waitUntil(runCronSnapshot(env))
  return new Response(
    JSON.stringify({ status: 'started', note: 'Snapshot generation started; poll /api/snapshot/latest in ~30–90s' }),
    { status: 202, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  )
}

async function handleRunSnapshotAdmin(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'POST') return jsonError('POST required', 405)
  const authError = requireAdminToken(request, env)
  if (authError) return authError
  return handleRunSnapshot(env, ctx)
}

async function handleIngestSnapshot(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return jsonError('POST required', 405)
  if (!env.SNAPSHOT_KV) return jsonError('SNAPSHOT_KV not configured', 503)
  const authError = requireAdminToken(request, env)
  if (authError) return authError

  let payload: IngestSnapshotRequest
  try {
    payload = await request.json() as IngestSnapshotRequest
  } catch {
    return jsonError('Invalid JSON body', 400)
  }
  const snapshot = 'snapshot' in payload ? payload.snapshot : payload
  if (!snapshot || !Array.isArray(snapshot.stocks) || !snapshot.date) {
    return jsonError('Body must be a DailySnapshot with { date, stocks[] }', 422)
  }

  // Persist via the same binding write path the cron uses.
  await env.SNAPSHOT_KV.put(SNAPSHOT_KEY, JSON.stringify(snapshot), { expirationTtl: 60 * 60 * 36 })
  let d1Written = 0
  let earningsRowsWritten = 0
  let universeRowsWritten = 0
  if (env.trading_etf_db) {
    if ('snapshot' in payload && Array.isArray(payload.historicalEarnings) && payload.historicalEarnings.length > 0) {
      earningsRowsWritten = await writeEarningsCalendarToD1(env.trading_etf_db, payload.historicalEarnings)
    }
    await writeSignalsToD1(env.trading_etf_db, snapshot)
    universeRowsWritten = await writeUniverseSnapshotToD1(env.trading_etf_db, snapshot.date, stockWatchlist)
    d1Written = snapshot.stocks.length
  }

  return new Response(
    JSON.stringify({
      status: 'ok',
      date: snapshot.date,
      stocks: snapshot.stocks.length,
      d1Written,
      earningsRowsWritten,
      universeRowsWritten
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  )
}

async function handleUniverseSnapshotsIngest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return jsonError('POST required', 405)
  if (!env.trading_etf_db) return jsonError('D1 not configured', 503)
  const authError = requireAdminToken(request, env)
  if (authError) return authError

  let payload: UniverseSnapshotRequest
  try {
    payload = await request.json() as UniverseSnapshotRequest
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  if (!payload || !Array.isArray(payload.snapshots) || payload.snapshots.length === 0) {
    return jsonError('Body must be { snapshots: [...] }', 422)
  }

  const rowsWritten = await writeUniverseSnapshotBatchToD1(env.trading_etf_db, payload.snapshots)
  return new Response(
    JSON.stringify({
      status: 'ok',
      snapshots: payload.snapshots.length,
      rowsWritten
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  )
}

async function handleSnapshotRead(env: Env): Promise<Response> {
  if (!env.SNAPSHOT_KV) {
    return jsonError('SNAPSHOT_KV not configured', 503)
  }

  const raw = await env.SNAPSHOT_KV.get(SNAPSHOT_KEY)
  if (!raw) {
    return jsonError('No snapshot available yet — cron has not run', 404)
  }

  const snapshot = JSON.parse(raw) as DailySnapshot
  const ageMs = Date.now() - new Date(snapshot.generatedAt).getTime()
  const stale = ageMs > 1000 * 60 * 60 * 25  // stale after 25h

  return new Response(raw, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': stale ? 'no-cache' : 'public, max-age=1800',
      'X-Snapshot-Date': snapshot.date,
      'X-Snapshot-Age-Minutes': String(Math.round(ageMs / 60000)),
      'X-Snapshot-Stale': String(stale)
    }
  })
}

async function handleYahoo(url: URL): Promise<Response> {
  const subpath = url.pathname.replace(/^\/api\/yahoo/, '')
  const targets = [
    `https://query1.finance.yahoo.com${subpath}${url.search}`,
    `https://query2.finance.yahoo.com${subpath}${url.search}`
  ]

  let lastError: Error | null = null
  for (const target of targets) {
    try {
      const response = await fetch(target, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
      })
      if (!response.ok) throw new Error(`Yahoo returned ${response.status}`)
      const body = await response.text()
      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=1800'
        }
      })
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Yahoo fetch failed')
    }
  }

  return new Response(JSON.stringify({ error: lastError?.message ?? 'Yahoo proxy failed' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
}

async function handleFinnhub(env: Env, url: URL): Promise<Response> {
  const apiKey = env.FINNHUB_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'FINNHUB_API_KEY not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }

  const subpath = url.pathname.replace(/^\/api\/finnhub/, '')
  const target = new URL(`https://finnhub.io/api/v1${subpath}${url.search}`)
  target.searchParams.set('token', apiKey)

  const response = await fetch(target, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
  })

  const body = await response.text()
  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}

// Returns ForwardReturnRecord-shaped rows for the Verify/Quant Lab tab.
// Query covers last `days` calendar days (default 365, max 730).
async function handleSignalsRead(env: Env, url: URL): Promise<Response> {
  if (!env.trading_etf_db) {
    return jsonError('D1 not configured', 503)
  }

  const label = url.searchParams.get('label') ?? null
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '365', 10), 730)
  const pointInTime = url.searchParams.get('point_in_time') === '1'
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const cols = [
    'ticker', 'signal_date', 'label', 'regime',
    'research_flags', 'rvol',
    'close_at_signal', 'next_open', 'ret1d', 'ret3d', 'ret5d', 'ret10d',
    'ret5d_vs_spy', 'ret10d_vs_spy',
    'mfe5d', 'mae5d', 'mfe10d', 'mae10d',
    'earnings_in_window', 'suggested_stop_loss', 'stop_loss_hit', 'atr_at_signal'
  ].join(', ')

  const baseWhere = label
    ? 'WHERE signal_date >= ? AND label = ? AND ret5d IS NOT NULL'
    : 'WHERE signal_date >= ? AND ret5d IS NOT NULL'

  const query = `SELECT ${cols} FROM signals ${baseWhere} ORDER BY signal_date DESC, ticker LIMIT 5000`
  const params = label ? [since, label] : [since]
  const { results } = await env.trading_etf_db.prepare(query).bind(...params).all()

  // Shape rows into ForwardReturnRecord for client consumption
  const rawRecords: ForwardReturnRecord[] = (results as Record<string, unknown>[]).map(row => ({
    signalDate: row.signal_date as string,
    ticker: row.ticker as string,
    label: row.label as ForwardReturnRecord['label'],
    closeAtSignal: (row.close_at_signal as number) ?? 0,
    nextOpen: row.next_open as number | null,
    ret1d: row.ret1d as number | null,
    ret3d: row.ret3d as number | null,
    ret5d: row.ret5d as number | null,
    ret10d: row.ret10d as number | null,
    ret5dVsSpy: row.ret5d_vs_spy as number | null,
    ret10dVsSpy: row.ret10d_vs_spy as number | null,
    mfe5d: row.mfe5d as number | null,
    mfe10d: row.mfe10d as number | null,
    mae5d: row.mae5d as number | null,
    mae10d: row.mae10d as number | null,
    earningsInWindow: row.earnings_in_window === 1,
    regimeAtSignal: (row.regime as ForwardReturnRecord['regimeAtSignal']) ?? 'neutral',
    researchFlags: row.research_flags ? (row.research_flags as string).split(',').filter(Boolean) as ForwardReturnRecord['researchFlags'] : [],
    rvolAtSignal: row.rvol as number | null,
    atrAtSignal: row.atr_at_signal as number | null,
    suggestedStopLoss: row.suggested_stop_loss as number | null,
    stopLossHit: row.stop_loss_hit === null ? null : row.stop_loss_hit === 1,
  }))

  let records = rawRecords
  let coveredMonths: string[] = []
  let exactSnapshotMonths: string[] = []
  let carryForwardSnapshotMonths: string[] = []
  let missingMonthsBeforeFirstSnapshot: string[] = []
  let droppedRowsBeforeFirstUniverseSnapshot = 0
  let droppedRowsTickerNotInUniverse = 0

  if (pointInTime) {
    const months = [...new Set(rawRecords.map(record => record.signalDate.slice(0, 7)))].sort()
    const timeline = await readUniverseSnapshotTimelineFromD1(env.trading_etf_db)
    const resolvedSnapshotBySignalMonth = new Map<string, typeof timeline[number] | null>()

    let timelineIndex = 0
    let latestResolved: typeof timeline[number] | null = null
    for (const month of months) {
      while (timelineIndex < timeline.length && timeline[timelineIndex].snapshotMonth <= month) {
        latestResolved = timeline[timelineIndex]
        timelineIndex += 1
      }
      resolvedSnapshotBySignalMonth.set(month, latestResolved)
    }

    coveredMonths = months.filter(month => resolvedSnapshotBySignalMonth.get(month))
    exactSnapshotMonths = months.filter(month => resolvedSnapshotBySignalMonth.get(month)?.snapshotMonth === month)
    carryForwardSnapshotMonths = months.filter(month => {
      const resolved = resolvedSnapshotBySignalMonth.get(month)
      return Boolean(resolved && resolved.snapshotMonth !== month)
    })
    missingMonthsBeforeFirstSnapshot = months.filter(month => !resolvedSnapshotBySignalMonth.get(month))

    records = rawRecords.filter(record => {
      const month = record.signalDate.slice(0, 7)
      const snapshot = resolvedSnapshotBySignalMonth.get(month)
      if (!snapshot || snapshot.tickers.size === 0) {
        droppedRowsBeforeFirstUniverseSnapshot += 1
        return false
      }
      if (!snapshot.tickers.has(record.ticker)) {
        droppedRowsTickerNotInUniverse += 1
        return false
      }
      return true
    })
  }

  return new Response(JSON.stringify({
    since,
    label,
    count: records.length,
    pointInTime,
    coveredMonths,
    exactSnapshotMonths,
    carryForwardSnapshotMonths,
    missingMonthsBeforeFirstSnapshot,
    droppedRowsBeforeFirstUniverseSnapshot,
    droppedRowsTickerNotInUniverse,
    records
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=900'
    }
  })
}

async function handleSignalStats(env: Env, url: URL): Promise<Response> {
  if (!env.trading_etf_db) return jsonError('D1 not configured', 503)

  const days = Math.min(365, Math.max(30, parseInt(url.searchParams.get('days') ?? '90', 10)))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { results } = await env.trading_etf_db.prepare(`
    SELECT
      label,
      COUNT(*) AS n,
      ROUND(AVG(ret5d) * 100, 2) AS avg_ret5d,
      ROUND(AVG(ret10d) * 100, 2) AS avg_ret10d,
      ROUND(AVG(ret5d_vs_spy) * 100, 2) AS avg_vs_spy,
      ROUND(SUM(CASE WHEN ret5d > 0 THEN 1.0 ELSE 0.0 END) * 100.0 / COUNT(*), 1) AS win_rate,
      ROUND(AVG(mfe5d) * 100, 2) AS avg_mfe5d,
      ROUND(AVG(mae5d) * 100, 2) AS avg_mae5d
    FROM signals
    WHERE signal_date >= ? AND ret5d IS NOT NULL
    GROUP BY label
    ORDER BY avg_ret5d DESC
  `).bind(since).all()

  return new Response(JSON.stringify({ since, days, stats: results }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=900'
    }
  })
}

async function handleTickerHistory(env: Env, url: URL): Promise<Response> {
  if (!env.trading_etf_db) return jsonError('D1 not configured', 503)

  const ticker = (url.searchParams.get('ticker') ?? '').toUpperCase().replace(/[^A-Z0-9.^-]/g, '')
  if (!ticker) return jsonError('ticker param required', 400)

  const days = Math.min(365, Math.max(14, parseInt(url.searchParams.get('days') ?? '90', 10)))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { results } = await env.trading_etf_db.prepare(`
    SELECT signal_date, label, ret5d, ret5d_vs_spy, close_at_signal
    FROM signals
    WHERE ticker = ? AND signal_date >= ?
    ORDER BY signal_date DESC
    LIMIT 60
  `).bind(ticker, since).all()

  return new Response(JSON.stringify({ ticker, since, rows: results }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300'
    }
  })
}

async function handleSignalBreadth(env: Env, url: URL): Promise<Response> {
  if (!env.trading_etf_db) return jsonError('D1 not configured', 503)

  const days = Math.min(90, Math.max(14, parseInt(url.searchParams.get('days') ?? '30', 10)))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { results } = await env.trading_etf_db.prepare(`
    SELECT
      signal_date AS date,
      SUM(CASE WHEN label IN ('LONG_BREAK','LONG_VCP','LONG_BOUNCE') THEN 1 ELSE 0 END) AS strong_bull,
      SUM(CASE WHEN label = 'LONG_BASE' THEN 1 ELSE 0 END) AS base,
      SUM(CASE WHEN label IN ('SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP') THEN 1 ELSE 0 END) AS bear,
      COUNT(*) AS total
    FROM signals
    WHERE signal_date >= ?
    GROUP BY signal_date
    ORDER BY signal_date ASC
  `).bind(since).all()

  return new Response(JSON.stringify({ since, days, rows: results }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=900'
    }
  })
}

// R7 Walk-forward: returns per-month performance for a single label — D1 SQL slicing replaces browser replay
async function handleSignalPerfByPeriod(env: Env, url: URL): Promise<Response> {
  if (!env.trading_etf_db) return jsonError('D1 not configured', 503)

  const label = url.searchParams.get('label') ?? 'LONG_BOUNCE'
  const allowed = new Set(['LONG_BREAK','LONG_VCP','LONG_BOUNCE','LONG_BASE','WATCH','NEUTRAL','SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP'])
  if (!allowed.has(label)) return jsonError('invalid label', 400)

  const { results } = await env.trading_etf_db.prepare(`
    SELECT
      SUBSTR(signal_date, 1, 7) AS period,
      COUNT(*) AS n,
      ROUND(AVG(ret5d) * 100, 2) AS avg_ret5d,
      ROUND(AVG(ret5d_vs_spy) * 100, 2) AS avg_vs_spy,
      ROUND(SUM(CASE WHEN ret5d > 0 THEN 1.0 ELSE 0.0 END) * 100.0 / COUNT(*), 1) AS win_rate,
      ROUND(AVG(mfe5d) * 100, 2) AS avg_mfe5d,
      ROUND(AVG(mae5d) * 100, 2) AS avg_mae5d
    FROM signals
    WHERE label = ? AND ret5d IS NOT NULL
    GROUP BY period
    ORDER BY period DESC
    LIMIT 12
  `).bind(label).all()

  return new Response(JSON.stringify({ label, periods: results }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}

async function handleResearchHealth(env: Env): Promise<Response> {
  if (!env.trading_etf_db) return jsonError('D1 not configured', 503)

  const [signalsResp, universeResp] = await Promise.all([
    env.trading_etf_db.prepare(`
      SELECT
        COUNT(*) AS total_signals,
        SUM(CASE WHEN ret5d IS NOT NULL THEN 1 ELSE 0 END) AS settled_signals,
        SUM(CASE WHEN earnings_in_window = 1 THEN 1 ELSE 0 END) AS earnings_window_signals,
        ROUND(100.0 * SUM(CASE WHEN earnings_in_window = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS earnings_ratio_pct,
        MIN(signal_date) AS first_signal_date,
        MAX(signal_date) AS last_signal_date
      FROM signals
    `).first(),
    env.trading_etf_db.prepare(`
      SELECT
        COUNT(DISTINCT snapshot_month) AS universe_snapshot_months,
        MIN(snapshot_month) AS first_snapshot_month,
        MAX(snapshot_month) AS last_snapshot_month,
        COUNT(*) AS universe_snapshot_rows
      FROM watchlist_universe_snapshots
    `).first()
  ])

  const signals = (signalsResp ?? {}) as Record<string, unknown>
  const universe = (universeResp ?? {}) as Record<string, unknown>
  const signalFirstMonth = typeof signals.first_signal_date === 'string' ? signals.first_signal_date.slice(0, 7) : null
  const signalLastMonth = typeof signals.last_signal_date === 'string' ? signals.last_signal_date.slice(0, 7) : null
  const firstSnapshotMonth = typeof universe.first_snapshot_month === 'string' ? universe.first_snapshot_month : null
  const lastSnapshotMonth = typeof universe.last_snapshot_month === 'string' ? universe.last_snapshot_month : null

  const pointInTimeHealth = {
    signalFirstMonth,
    signalLastMonth,
    firstSnapshotMonth,
    lastSnapshotMonth,
    monthsBeforeFirstSnapshot: signalFirstMonth && firstSnapshotMonth && signalFirstMonth < firstSnapshotMonth
      ? monthDiff(signalFirstMonth, firstSnapshotMonth)
      : 0,
  }

  return new Response(JSON.stringify({
    signals,
    universe,
    pointInTimeHealth
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300'
    }
  })
}

function monthDiff(startMonth: string, endMonth: string): number {
  const [startYear, startMon] = startMonth.split('-').map(Number)
  const [endYear, endMon] = endMonth.split('-').map(Number)
  return Math.max(0, (endYear - startYear) * 12 + (endMon - startMon))
}

async function handleBackfill(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.trading_etf_db) return jsonError('D1 not configured', 503)
  const authError = requireAdminToken(request, env)
  if (authError) return authError

  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10))
  const batchSize = Math.min(30, parseInt(url.searchParams.get('batch_size') ?? '30', 10))

  try {
    const result = await runBackfillChunk(env.trading_etf_db, offset, batchSize)
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Backfill failed', 500)
  }
}

async function handleETFBackfill(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.trading_etf_db) return jsonError('D1 not configured', 503)
  const authError = requireAdminToken(request, env)
  if (authError) return authError

  const weeksBack = Math.min(104, Math.max(4, parseInt(url.searchParams.get('weeks') ?? '52', 10)))

  try {
    const result = await runETFBackfill(env.trading_etf_db, weeksBack)
    return new Response(JSON.stringify({ ok: true, weeksBack, ...result }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'ETF backfill failed', 500)
  }
}

// Returns ETFSignalRow-shaped rows for the ETF Replay tab.
async function handleETFSignalsRead(env: Env, url: URL): Promise<Response> {
  if (!env.trading_etf_db) return jsonError('D1 not configured', 503)

  const weeks = Math.min(104, Math.max(4, parseInt(url.searchParams.get('weeks') ?? '26', 10)))
  const ticker = url.searchParams.get('ticker') ?? null
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const baseWhere = ticker
    ? 'WHERE week_ending_date >= ? AND ticker = ?'
    : 'WHERE week_ending_date >= ?'
  const params = ticker ? [since, ticker] : [since]

  let results: Record<string, unknown>[]
  let priceContextAvailable = true

  try {
    const query = `SELECT ticker, week_ending_date, label, indicators_json, regime, close_at_signal, prev_close, recent_close_json, ret1w, ret4w
                   FROM etf_signals ${baseWhere}
                   ORDER BY week_ending_date DESC, ticker
                   LIMIT 5000`
    const response = await env.trading_etf_db.prepare(query).bind(...params).all()
    results = response.results as Record<string, unknown>[]
  } catch (error) {
    // Keep the endpoint usable while the additive price-context migration rolls out.
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('prev_close') && !message.includes('recent_close_json')) {
      return jsonError(`ETF signals query failed: ${message}`, 500)
    }

    priceContextAvailable = false
    const legacyQuery = `SELECT ticker, week_ending_date, label, indicators_json, regime, close_at_signal, ret1w, ret4w
                         FROM etf_signals ${baseWhere}
                         ORDER BY week_ending_date DESC, ticker
                         LIMIT 5000`
    try {
      const response = await env.trading_etf_db.prepare(legacyQuery).bind(...params).all()
      results = response.results as Record<string, unknown>[]
    } catch (legacyError) {
      const legacyMessage = legacyError instanceof Error ? legacyError.message : String(legacyError)
      return jsonError(`ETF signals query failed: ${legacyMessage}`, 500)
    }
  }

  const rows: ETFSignalRow[] = results.map(row => ({
    ticker: row.ticker as string,
    weekEndingDate: row.week_ending_date as string,
    label: row.label as ETFSignalRow['label'],
    indicatorsJson: (row.indicators_json as string) ?? '{}',
    regime: (row.regime as string) ?? 'neutral',
    closeAtSignal: row.close_at_signal as number | null,
    prevClose: row.prev_close as number | null,
    recentCloseJson: (row.recent_close_json as string) ?? '[]',
    ret1w: row.ret1w as number | null,
    ret4w: row.ret4w as number | null,
  }))

  return new Response(JSON.stringify({ since, ticker, count: rows.length, priceContextAvailable, rows }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=900'
    }
  })
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
}

interface Env {
  FINNHUB_API_KEY: string
  SNAPSHOT_KV: KVNamespace
  trading_etf_db: D1Database
  ASSETS: Fetcher
  INGEST_TOKEN?: string   // shared secret for POST /api/admin/ingest-snapshot
}
