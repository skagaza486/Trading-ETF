// Capital Manager Worker — P4
//
// API surface for the Capital Manager app. All mutation endpoints require
// Bearer token authentication (constant-time compared). The /health endpoint
// is public.
//
// Deploy: wrangler deploy --config wrangler.capital.toml

import { requireAuth } from './lib/auth'
import { recordTradeResult } from '../src/engine/riskEngine'
import { runEodExit, type EodResult } from '../src/engine/exitEngine'
import type { Position, RiskState, TradeResult, PaperTrade } from '../src/types/capital'

// ── CORS ──────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://trading-etf.skagaza486.workers.dev',
  'http://localhost:5173',
  'http://localhost:8787',
  'http://localhost:8788',
  'https://capital.skagaza486.workers.dev',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : 'null'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200, request?: Request): Response {
  const origin = request?.headers.get('Origin') ?? null
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  })
}

function jsonError(message: string, status = 400, request?: Request): Response {
  return json({ error: message }, status, request)
}

/** Read request body as JSON, with size limit. */
async function readBody(request: Request): Promise<unknown> {
  const text = await request.text()
  if (text.length > 1_000_000) throw new Error('Body too large')
  return JSON.parse(text)
}

/** Convert snake_case D1 row to camelCase Position. */
function rowToPosition(row: Record<string, unknown>): Position {
  return {
    id: row.id as number,
    ticker: row.ticker as string,
    qty: row.qty as number,
    avgCostCents: row.avg_cost_cents as number,
    peakPriceCents: row.peak_price_cents as number,
    sleeve: row.sleeve as 'stock' | 'etf',
    sector: row.sector as string,
    openedAt: row.opened_at as string,
    earningsDate: (row.earnings_date as string) ?? undefined,
  }
}

/** Parse a D1 risk_state row (last_3_results is a JSON string) into RiskState. */
function rowToRiskState(row: Record<string, unknown>): RiskState {
  return {
    capitalBaseCents: row.capital_base_cents as number,
    currency: 'USD',
    regime: row.regime as 'long_friendly' | 'neutral' | 'short_friendly',
    pauseUntil: (row.pause_until as string) ?? null,
    last3Results: JSON.parse(row.last_3_results as string) as TradeResult[],
  }
}

/** Get today's date as ISO YYYY-MM-DD string. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Get now as ISO datetime string. */
function nowIso(): string {
  return new Date().toISOString()
}

// ── Route handlers ────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url
    const method = request.method

    try {
      // ── CORS preflight ────────────────────────────────────────────────────

      if (method === 'OPTIONS') {
        const origin = request.headers.get('Origin') ?? null
        return new Response(null, { status: 204, headers: corsHeaders(origin) })
      }

      // ── Route matching ────────────────────────────────────────────────────

      // GET /health — public, no auth required
      if (pathname === '/health' && method === 'GET') {
        return json({ service: 'capital', status: 'ok' }, 200, request)
      }

      // ── All routes below require auth ─────────────────────────────────────

      const authResponse = requireAuth(request, env)
      if (authResponse) return authResponse

      // GET /api/capital/risk-state
      if (pathname === '/api/capital/risk-state' && method === 'GET') {
        return await handleGetRiskState(env, request)
      }

      // PATCH /api/capital/risk-state
      if (pathname === '/api/capital/risk-state' && method === 'PATCH') {
        return await handlePatchRiskState(request, env)
      }

      // GET /api/capital/positions?sleeve=stock|etf
      if (pathname === '/api/capital/positions' && method === 'GET') {
        return await handleGetPositions(url, env, request)
      }

      // POST /api/capital/positions
      if (pathname === '/api/capital/positions' && method === 'POST') {
        return await handleCreatePosition(request, env)
      }

      // PATCH /api/capital/positions/:id
      const patchMatch = pathname.match(/^\/api\/capital\/positions\/(\d+)$/)
      if (patchMatch && method === 'PATCH') {
        return await handlePatchPosition(request, env, parseInt(patchMatch[1]))
      }

      // DELETE /api/capital/positions/:id
      const deleteMatch = pathname.match(/^\/api\/capital\/positions\/(\d+)$/)
      if (deleteMatch && method === 'DELETE') {
        return await handleDeletePosition(request, env, parseInt(deleteMatch[1]))
      }

      // POST /api/capital/eod-eval
      if (pathname === '/api/capital/eod-eval' && method === 'POST') {
        return await handleEodEval(request, env)
      }

      // POST /api/capital/record-result
      if (pathname === '/api/capital/record-result' && method === 'POST') {
        return await handleRecordResult(request, env)
      }

      // GET /api/capital/cash-ledger?limit=50
      if (pathname === '/api/capital/cash-ledger' && method === 'GET') {
        return await handleGetCashLedger(url, env, request)
      }

      // GET /api/capital/paper-trades
      if (pathname === '/api/capital/paper-trades' && method === 'GET') {
        return await handleGetPaperTrades(env, request)
      }

      // POST /api/capital/paper-trades
      if (pathname === '/api/capital/paper-trades' && method === 'POST') {
        return await handleCreatePaperTrade(request, env)
      }

      // PATCH /api/capital/paper-trades/:id
      const patchPaperMatch = pathname.match(/^\/api\/capital\/paper-trades\/(\d+)$/)
      if (patchPaperMatch && method === 'PATCH') {
        return await handlePatchPaperTrade(request, env, parseInt(patchPaperMatch[1]))
      }

      // DELETE /api/capital/paper-trades/:id
      const deletePaperMatch = pathname.match(/^\/api\/capital\/paper-trades\/(\d+)$/)
      if (deletePaperMatch && method === 'DELETE') {
        return await handleDeletePaperTrade(request, env, parseInt(deletePaperMatch[1]))
      }

      // ── 404 ──
      return jsonError('Not found', 404, request)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error'
      return jsonError(message, 500, request)
    }
  },
}

// ── Endpoint implementations ──────────────────────────────────────────────────

async function handleGetRiskState(env: Env, request: Request): Promise<Response> {
  const { results } = await env.CAPITAL_DB.prepare(
    'SELECT * FROM risk_state WHERE id = 1',
  ).all()
  if (!results || results.length === 0) {
    return jsonError('Risk state not found — run schema/capital-r1-core.sql first', 503, request)
  }
  const row = results[0] as Record<string, unknown>
  const state = rowToRiskState(row)
  return json({
    capitalBaseCents: state.capitalBaseCents,
    currency: state.currency,
    regime: state.regime,
    pauseUntil: state.pauseUntil,
    last3Results: state.last3Results,
  }, 200, request)
}

async function handlePatchRiskState(request: Request, env: Env): Promise<Response> {
  const body = (await readBody(request)) as { capitalBaseCents?: number; regime?: string }

  const validRegimes = ['long_friendly', 'neutral', 'short_friendly']
  if (body.regime !== undefined && !validRegimes.includes(body.regime)) {
    return jsonError(`Invalid regime. Must be one of: ${validRegimes.join(', ')}`, 400, request)
  }

  // Build dynamic UPDATE
  const sets: string[] = []
  const params: unknown[] = []
  if (body.capitalBaseCents !== undefined) {
    if (!Number.isInteger(body.capitalBaseCents) || body.capitalBaseCents < 0) {
      return jsonError('capitalBaseCents must be a non-negative integer', 400, request)
    }
    sets.push('capital_base_cents = ?')
    params.push(body.capitalBaseCents)
  }
  if (body.regime !== undefined) {
    sets.push('regime = ?')
    params.push(body.regime)
  }
  if (sets.length === 0) {
    return jsonError('No valid fields to update. Provide capitalBaseCents and/or regime.', 400, request)
  }

  params.push(1) // WHERE id = 1
  await env.CAPITAL_DB.prepare(
    `UPDATE risk_state SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...params).run()

  // Return updated state
  return await handleGetRiskState(env, request)
}

async function handleGetPositions(url: URL, env: Env, request: Request): Promise<Response> {
  const sleeve = url.searchParams.get('sleeve')
  let query = 'SELECT * FROM positions'
  const params: unknown[] = []

  if (sleeve === 'stock' || sleeve === 'etf') {
    query += ' WHERE sleeve = ?'
    params.push(sleeve)
  }

  query += ' ORDER BY opened_at DESC, ticker ASC'

  const { results } = await env.CAPITAL_DB.prepare(query).bind(...params).all()
  const positions = (results ?? []).map(r => rowToPosition(r as Record<string, unknown>))
  return json({ positions, count: positions.length }, 200, request)
}

async function handleCreatePosition(request: Request, env: Env): Promise<Response> {
  const body = (await readBody(request)) as {
    ticker?: string
    qty?: number
    avgCostCents?: number
    sleeve?: string
    sector?: string
    openedAt?: string
    earningsDate?: string | null
  }

  // Validation
  if (!body.ticker) return jsonError('ticker is required', 400, request)
  if (!body.qty || !Number.isInteger(body.qty) || body.qty <= 0) return jsonError('qty must be a positive integer', 400, request)
  if (!body.avgCostCents || !Number.isInteger(body.avgCostCents) || body.avgCostCents <= 0) return jsonError('avgCostCents must be a positive integer', 400, request)
  if (body.sleeve !== 'stock' && body.sleeve !== 'etf') return jsonError('sleeve must be "stock" or "etf"', 400, request)
  if (!body.sector) return jsonError('sector is required', 400, request)
  if (!body.openedAt) return jsonError('openedAt is required (ISO date)', 400, request)

  const ticker = body.ticker.toUpperCase()
  const qty = body.qty
  const avgCostCents = body.avgCostCents
  const sleeve = body.sleeve as 'stock' | 'etf'
  const sector = body.sector
  const openedAt = body.openedAt
  const earningsDate = body.earningsDate ?? null
  const peakPriceCents = avgCostCents // initial peak = cost

  // Insert position
  const result = await env.CAPITAL_DB.prepare(`
    INSERT INTO positions (ticker, qty, avg_cost_cents, peak_price_cents, sleeve, sector, opened_at, earnings_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).bind(ticker, qty, avgCostCents, peakPriceCents, sleeve, sector, openedAt, earningsDate).all()

  if (!result.results || result.results.length === 0) {
    return jsonError('Failed to create position (possibly duplicate ticker+sleeve)', 409, request)
  }

  const position = rowToPosition(result.results[0] as Record<string, unknown>)

  // Write cash_ledger entry (buy = negative amount)
  const amountCents = -(qty * avgCostCents)
  await env.CAPITAL_DB.prepare(`
    INSERT INTO cash_ledger (type, ticker, amount_cents, memo)
    VALUES ('buy', ?, ?, 'Position opened')
  `).bind(ticker, amountCents).run()

  return json(position, 201, request)
}

async function handlePatchPosition(request: Request, env: Env, id: number): Promise<Response> {
  const body = (await readBody(request)) as { peakPriceCents?: number; qty?: number }

  const sets: string[] = []
  const params: unknown[] = []

  if (body.peakPriceCents !== undefined) {
    if (!Number.isInteger(body.peakPriceCents) || body.peakPriceCents <= 0) {
      return jsonError('peakPriceCents must be a positive integer', 400, request)
    }
    sets.push('peak_price_cents = ?')
    params.push(body.peakPriceCents)
  }
  if (body.qty !== undefined) {
    if (!Number.isInteger(body.qty) || body.qty <= 0) {
      return jsonError('qty must be a positive integer', 400, request)
    }
    sets.push('qty = ?')
    params.push(body.qty)
  }
  if (sets.length === 0) {
    return jsonError('No valid fields to update. Provide peakPriceCents and/or qty.', 400, request)
  }

  params.push(id)
  const result = await env.CAPITAL_DB.prepare(
    `UPDATE positions SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
  ).bind(...params).all()

  if (!result.results || result.results.length === 0) {
    return jsonError('Position not found', 404, request)
  }

  return json(rowToPosition(result.results[0] as Record<string, unknown>), 200, request)
}

async function handleDeletePosition(request: Request, env: Env, id: number): Promise<Response> {
  const body = (await readBody(request)) as { currentPriceCents?: number; result?: string }

  if (!body.currentPriceCents || !Number.isInteger(body.currentPriceCents) || body.currentPriceCents <= 0) {
    return jsonError('currentPriceCents must be a positive integer', 400, request)
  }
  if (body.result !== 'win' && body.result !== 'loss') {
    return jsonError('result must be "win" or "loss"', 400, request)
  }

  // Fetch the position
  const { results } = await env.CAPITAL_DB.prepare(
    'SELECT * FROM positions WHERE id = ?',
  ).bind(id).all()

  if (!results || results.length === 0) {
    return jsonError('Position not found', 404, request)
  }

  const pos = results[0] as Record<string, unknown>
  const ticker = pos.ticker as string
  const qty = pos.qty as number
  const avgCostCents = pos.avg_cost_cents as number

  // Calculate P&L
  const pnlCents = (body.currentPriceCents - avgCostCents) * qty

  // Insert realized_pnl
  await env.CAPITAL_DB.prepare(
    'INSERT INTO realized_pnl (ticker, pnl_cents, closed_at) VALUES (?, ?, ?)',
  ).bind(ticker, pnlCents, todayIso()).run()

  // Insert cash_ledger entry (sell = positive amount)
  const sellAmount = qty * body.currentPriceCents
  await env.CAPITAL_DB.prepare(
    "INSERT INTO cash_ledger (type, ticker, amount_cents, memo) VALUES ('sell', ?, ?, 'Position closed')",
  ).bind(ticker, sellAmount).run()

  // Delete position
  await env.CAPITAL_DB.prepare('DELETE FROM positions WHERE id = ?').bind(id).run()

  // Update risk state with trade result
  const { results: stateResults } = await env.CAPITAL_DB.prepare(
    'SELECT * FROM risk_state WHERE id = 1',
  ).all()
  if (stateResults && stateResults.length > 0) {
    const riskState = rowToRiskState(stateResults[0] as Record<string, unknown>)
    const updatedRiskState = recordTradeResult(riskState, body.result as TradeResult, todayIso())
    await env.CAPITAL_DB.prepare(
      'UPDATE risk_state SET last_3_results = ?, pause_until = ? WHERE id = 1',
    ).bind(JSON.stringify(updatedRiskState.last3Results), updatedRiskState.pauseUntil).run()

    return json({
      pnlCents,
      result: body.result,
      newRiskState: updatedRiskState,
    }, 200, request)
  }

  return json({ pnlCents, result: body.result }, 200, request)
}

async function handleEodEval(request: Request, env: Env): Promise<Response> {
  const body = (await readBody(request)) as { priceMap?: Record<string, number> }
  const priceMap: Record<string, number> = body.priceMap ?? {}

  // Read stock positions
  const { results: posResults } = await env.CAPITAL_DB.prepare(
    "SELECT * FROM positions WHERE sleeve = 'stock'",
  ).all()
  const positions: Position[] = (posResults ?? []).map(r => rowToPosition(r as Record<string, unknown>))

  // Read risk state
  const { results: stateResults } = await env.CAPITAL_DB.prepare(
    'SELECT * FROM risk_state WHERE id = 1',
  ).all()
  const capitalBaseCents = (stateResults && stateResults.length > 0)
    ? (stateResults[0] as Record<string, unknown>).capital_base_cents as number
    : 0

  // Run EOD exit evaluation (pure function)
  const eodResult: EodResult = runEodExit(positions, priceMap, capitalBaseCents)

  // Apply peak updates (write to D1)
  if (eodResult.peakUpdates.length > 0) {
    const stmt = env.CAPITAL_DB.prepare(
      'UPDATE positions SET peak_price_cents = ? WHERE id = ?',
    )
    for (const update of eodResult.peakUpdates) {
      await stmt.bind(update.newPeakPriceCents, update.positionId).run()
    }
  }

  // Write exit cards to trade_log
  if (eodResult.exitCards.length > 0) {
    const stmt = env.CAPITAL_DB.prepare(`
      INSERT INTO trade_log (action, ticker, sleeve, approved, rule_triggers, detail)
      VALUES ('exit', ?, 'stock', 1, ?, ?)
    `)
    for (const card of eodResult.exitCards) {
      const triggers = JSON.stringify([card.ruleDescription])
      const detail = `${card.action} ${card.qtyToClose} shares at ${card.currentPriceCents}¢ — ${card.ruleDetail}`
      await stmt.bind(card.ticker, triggers, detail).run()
    }
  }

  return json(eodResult, 200, request)
}

async function handleRecordResult(request: Request, env: Env): Promise<Response> {
  const body = (await readBody(request)) as { result?: string }
  if (body.result !== 'win' && body.result !== 'loss') {
    return jsonError('result must be "win" or "loss"', 400, request)
  }

  const { results } = await env.CAPITAL_DB.prepare(
    'SELECT * FROM risk_state WHERE id = 1',
  ).all()
  if (!results || results.length === 0) {
    return jsonError('Risk state not found', 503, request)
  }

  const riskState = rowToRiskState(results[0] as Record<string, unknown>)
  const updatedRiskState = recordTradeResult(riskState, body.result as TradeResult, todayIso())

  await env.CAPITAL_DB.prepare(
    'UPDATE risk_state SET last_3_results = ?, pause_until = ? WHERE id = 1',
  ).bind(JSON.stringify(updatedRiskState.last3Results), updatedRiskState.pauseUntil).run()

  return json(updatedRiskState, 200, request)
}

async function handleGetCashLedger(url: URL, env: Env, request: Request): Promise<Response> {
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit') ?? '50')), 500)

  const { results } = await env.CAPITAL_DB.prepare(`
    SELECT id, type, ticker, amount_cents, created_at, memo
    FROM cash_ledger
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(limit).all()

  const entries = (results ?? []).map(r => {
    const row = r as Record<string, unknown>
    return {
      id: row.id as number,
      type: row.type as string,
      ticker: (row.ticker as string) ?? undefined,
      amountCents: row.amount_cents as number,
      createdAt: row.created_at as string,
      memo: (row.memo as string) ?? undefined,
    }
  })

  return json({ entries, count: entries.length }, 200, request)
}

// ── Paper trade handlers ───────────────────────────────────────────────────────

function rowToPaperTrade(row: Record<string, unknown>): PaperTrade {
  return {
    id: row.id as number,
    ticker: row.ticker as string,
    weekStart: row.week_start as string,
    entryPriceCents: row.entry_price_cents as number,
    currentPriceCents: (row.current_price_cents as number) ?? null,
    sector: row.sector as string,
    regime: row.regime as string,
    status: row.status as 'open' | 'closed',
    closedPriceCents: (row.closed_price_cents as number) ?? null,
    closedAt: (row.closed_at as string) ?? null,
    note: (row.note as string) ?? null,
    createdAt: row.created_at as string,
  }
}

async function handleGetPaperTrades(env: Env, request: Request): Promise<Response> {
  const { results } = await env.CAPITAL_DB.prepare(`
    SELECT * FROM paper_trades ORDER BY week_start DESC, created_at ASC
  `).all()
  const trades = (results ?? []).map(r => rowToPaperTrade(r as Record<string, unknown>))
  return json({ trades, count: trades.length }, 200, request)
}

async function handleCreatePaperTrade(request: Request, env: Env): Promise<Response> {
  const body = (await readBody(request)) as {
    ticker?: string
    weekStart?: string
    entryPriceCents?: number
    sector?: string
    regime?: string
    note?: string | null
  }

  if (!body.ticker) return jsonError('ticker is required', 400, request)
  if (!body.weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)) {
    return jsonError('weekStart is required (ISO date YYYY-MM-DD)', 400, request)
  }
  if (!body.entryPriceCents || !Number.isInteger(body.entryPriceCents) || body.entryPriceCents <= 0) {
    return jsonError('entryPriceCents must be a positive integer', 400, request)
  }
  if (!body.sector) return jsonError('sector is required', 400, request)

  const ticker = body.ticker.toUpperCase()
  const regime = body.regime ?? 'neutral'
  const note = body.note ?? null

  const result = await env.CAPITAL_DB.prepare(`
    INSERT INTO paper_trades (ticker, week_start, entry_price_cents, sector, regime, note)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING *
  `).bind(ticker, body.weekStart, body.entryPriceCents, body.sector, regime, note).all()

  if (!result.results || result.results.length === 0) {
    return jsonError('Failed to create paper trade', 500, request)
  }
  return json(rowToPaperTrade(result.results[0] as Record<string, unknown>), 201, request)
}

async function handlePatchPaperTrade(request: Request, env: Env, id: number): Promise<Response> {
  const body = (await readBody(request)) as {
    currentPriceCents?: number
    note?: string | null
  }

  const sets: string[] = []
  const params: unknown[] = []

  if (body.currentPriceCents !== undefined) {
    if (!Number.isInteger(body.currentPriceCents) || body.currentPriceCents <= 0) {
      return jsonError('currentPriceCents must be a positive integer', 400, request)
    }
    sets.push('current_price_cents = ?')
    params.push(body.currentPriceCents)
  }
  if (body.note !== undefined) {
    sets.push('note = ?')
    params.push(body.note)
  }
  if (sets.length === 0) {
    return jsonError('No valid fields to update', 400, request)
  }

  params.push(id)
  const result = await env.CAPITAL_DB.prepare(
    `UPDATE paper_trades SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
  ).bind(...params).all()

  if (!result.results || result.results.length === 0) {
    return jsonError('Paper trade not found', 404, request)
  }
  return json(rowToPaperTrade(result.results[0] as Record<string, unknown>), 200, request)
}

async function handleDeletePaperTrade(request: Request, env: Env, id: number): Promise<Response> {
  const body = (await readBody(request)) as { closedPriceCents?: number }

  // Fetch the trade to get entry price
  const { results } = await env.CAPITAL_DB.prepare(
    'SELECT * FROM paper_trades WHERE id = ?',
  ).bind(id).all()

  if (!results || results.length === 0) {
    return jsonError('Paper trade not found', 404, request)
  }

  const closedPriceCents = body.closedPriceCents ?? null
  const closedAt = closedPriceCents ? todayIso() : null

  const result = await env.CAPITAL_DB.prepare(`
    UPDATE paper_trades
    SET status = 'closed', closed_price_cents = ?, closed_at = ?
    WHERE id = ?
    RETURNING *
  `).bind(closedPriceCents, closedAt, id).all()

  if (!result.results || result.results.length === 0) {
    return jsonError('Failed to close paper trade', 500, request)
  }
  return json(rowToPaperTrade(result.results[0] as Record<string, unknown>), 200, request)
}
