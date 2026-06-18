import { buildDailySnapshot, writeSignalsToD1 } from './src/worker/cronSnapshot'
import type { DailySnapshot } from './src/types/snapshot'

const SNAPSHOT_KEY = 'snapshot:latest'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
    const snapshot = await buildDailySnapshot()
    await env.SNAPSHOT_KV.put(SNAPSHOT_KEY, JSON.stringify(snapshot), {
      expirationTtl: 60 * 60 * 36  // 36h TTL — survives weekends
    })

    if (env.trading_etf_db) {
      await writeSignalsToD1(env.trading_etf_db, snapshot)
      console.log(`Cron D1: wrote ${snapshot.stocks.length} signals for ${snapshot.date}`)
    }

    console.log(`Cron snapshot: done. ${snapshot.stocks.length} stocks, date=${snapshot.date}`)
  } catch (error) {
    console.error('Cron snapshot failed:', error instanceof Error ? error.message : String(error))
  }
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

async function handleSignalsRead(env: Env, url: URL): Promise<Response> {
  if (!env.trading_etf_db) {
    return jsonError('D1 not configured', 503)
  }

  const label = url.searchParams.get('label') ?? null
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '30', 10), 90)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const query = label
    ? 'SELECT ticker, signal_date, label, previous_label, regime, rs_rank, rsi14, rvol, rs_vs_spy, research_flags, reason FROM signals WHERE signal_date >= ? AND label = ? ORDER BY signal_date DESC, ticker LIMIT 500'
    : 'SELECT ticker, signal_date, label, previous_label, regime, rs_rank, rsi14, rvol, rs_vs_spy, research_flags, reason FROM signals WHERE signal_date >= ? ORDER BY signal_date DESC, ticker LIMIT 500'

  const params = label ? [since, label] : [since]
  const { results } = await env.trading_etf_db.prepare(query).bind(...params).all()

  return new Response(JSON.stringify({ since, label, count: results.length, signals: results }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' }
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
}
