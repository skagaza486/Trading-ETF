// SignalPilot control-plane Worker (SP-0/SP-1/SP-2/SP-4).
//
// This Worker is intentionally separate from `trading-etf` (ADR-SP-000): it
// holds the mutation surface that will eventually move money. SP-0 ships no
// trading logic — only the spine that everything later must pass through:
//   1. no mutation without a valid bearer token (verifyToken)
//   2. no mutation replay (replayGuard: signed-window timestamp + single-use nonce)
//   3. a server-side kill switch that trade mutations fail closed against
//   4. an append-only, hash-chained audit row for every state change / denial
//
// Deploy: wrangler deploy --config wrangler.signalpilot.toml

import { json, jsonError, newRequestId } from './lib/http'
import { verifyToken, authenticateMutation } from './lib/auth'
import { isTradingDisabled, setTradingDisabled } from './lib/killSwitch'
import { appendAudit, readAudit, verifyChain } from './lib/audit'
import { runIntent } from './lib/sp1/intentFlow'
import { getBalance, listCash } from './lib/sp1/ledger'
import { getOpenPositions } from './lib/sp1/positions'
import { PAPER_ACCOUNT_ID } from './lib/sp1/types'
import { runDailyBatch } from './lib/sp2/batchFlow'
import { handleSp4Shadow, handleSp4ShadowRead, handleSp4ModelRegister } from './lib/sp4/shadowHandler'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url
    const method = request.method

    try {
      // --- Public: liveness + kill-switch state (no secrets) ---
      if (pathname === '/health' && method === 'GET') {
        return json({ service: 'signalpilot', status: 'ok', tradingDisabled: await isTradingDisabled(env) })
      }

      // --- Authenticated reads ---
      if (pathname === '/api/control/status' && method === 'GET') {
        return withTokenRead(request, env, async () =>
          json({ tradingDisabled: await isTradingDisabled(env) }),
        )
      }

      if (pathname === '/api/audit' && method === 'GET') {
        return withTokenRead(request, env, async () => {
          const limit = Number(url.searchParams.get('limit') ?? '50')
          const [rows, chain] = await Promise.all([readAudit(env.SIGNALPILOT_DB, limit), verifyChain(env.SIGNALPILOT_DB)])
          return json({ chain, count: rows.length, rows })
        })
      }

      // --- Authenticated mutations (token + replay guard + audit) ---
      if (pathname === '/api/control/kill' && method === 'POST') {
        return handleKill(request, env, true)
      }
      if (pathname === '/api/control/resume' && method === 'POST') {
        return handleKill(request, env, false)
      }

      // Proves the trade-gating path end-to-end without doing anything: full
      // mutation gate + fail-closed kill-switch check. Real trade endpoints land
      // in SP-1 and reuse exactly this pattern.
      if (pathname === '/api/trade/preflight' && method === 'POST') {
        return handlePreflight(request, env)
      }

      // --- SP-1: Paper Ledger reads (token only, no replay needed) ---
      if (pathname === '/api/sp1/account' && method === 'GET') {
        return withTokenRead(request, env, async () => {
          const cash = await getBalance(env.SIGNALPILOT_DB, PAPER_ACCOUNT_ID)
          return json({ accountId: PAPER_ACCOUNT_ID, currency: 'USD', cash_balance_cents: cash, cash_balance_usd: cash / 100 })
        })
      }

      if (pathname === '/api/sp1/positions' && method === 'GET') {
        return withTokenRead(request, env, async () => {
          const positions = await getOpenPositions(env.SIGNALPILOT_DB, PAPER_ACCOUNT_ID)
          return json({ positions, count: positions.length })
        })
      }

      if (pathname === '/api/sp1/ledger' && method === 'GET') {
        return withTokenRead(request, env, async () => {
          const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200)
          const entries = await listCash(env.SIGNALPILOT_DB, PAPER_ACCOUNT_ID, limit)
          return json({ entries, count: entries.length })
        })
      }

      // --- SP-1: Paper trade intent (full mutation gate: token + replay + kill-switch + audit) ---
      if (pathname === '/api/sp1/intent' && method === 'POST') {
        return handleIntent(request, env)
      }

      // --- SP-2: Rule-only shadow portfolio ---

      // Daily batch: pull today's signals, run eligibility/risk/sizing, execute entries + exits.
      // Called by GH Actions signalpilot-daily.yml after the snapshot build completes.
      // Mutation gate: token + replay + kill-switch.
      if (pathname === '/api/sp2/batch' && method === 'POST') {
        return handleSp2Batch(request, env)
      }

      // Read: recent candidate decisions (approved + rejected with reason codes).
      if (pathname === '/api/sp2/candidates' && method === 'GET') {
        return withTokenRead(request, env, async () => {
          const days = Math.min(Number(url.searchParams.get('days') ?? '7'), 90)
          const limit = Math.min(Number(url.searchParams.get('limit') ?? '100'), 500)
          const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
          const { results } = await env.SIGNALPILOT_DB.prepare(`
            SELECT * FROM candidate_decisions
            WHERE account_id = ? AND decision_date >= ?
            ORDER BY decision_date DESC, created_at DESC
            LIMIT ?
          `).bind(PAPER_ACCOUNT_ID, cutoff, limit).all()
          return json({ count: results.length, candidates: results })
        })
      }

      // Read: strategy daily snapshots (NAV + attribution).
      if (pathname === '/api/sp2/portfolio' && method === 'GET') {
        return withTokenRead(request, env, async () => {
          const days = Math.min(Number(url.searchParams.get('days') ?? '30'), 365)
          const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
          const { results } = await env.SIGNALPILOT_DB.prepare(`
            SELECT * FROM strategy_daily_snapshots
            WHERE account_id = ? AND snapshot_date >= ?
            ORDER BY snapshot_date DESC
          `).bind(PAPER_ACCOUNT_ID, cutoff).all()
          const cash = await getBalance(env.SIGNALPILOT_DB, PAPER_ACCOUNT_ID)
          const positions = await getOpenPositions(env.SIGNALPILOT_DB, PAPER_ACCOUNT_ID)
          return json({ snapshots: results, current: { cashCents: cash, openPositions: positions.length } })
        })
      }

      // --- SP-4: AI Shadow Mode ---

      // Receive daily shadow inferences from GH Actions Python scorer.
      // Mutation gate: token + replay. Does NOT require kill-switch (shadow never trades).
      if (pathname === '/api/sp4/shadow' && method === 'POST') {
        return withTokenMutation(request, env, 'sp4.shadow.ingest', req =>
          handleSp4Shadow(req, env),
        )
      }

      // Read shadow inferences for a date range.
      if (pathname === '/api/sp4/shadow' && method === 'GET') {
        return withTokenRead(request, env, () => handleSp4ShadowRead(url, env))
      }

      // Register a promoted model in the model registry.
      if (pathname === '/api/sp4/model' && method === 'POST') {
        return withTokenMutation(request, env, 'sp4.model.register', req =>
          handleSp4ModelRegister(req, env),
        )
      }

      return jsonError('Not found', 404)
    } catch (err) {
      console.error('unhandled error:', err instanceof Error ? err.stack ?? err.message : String(err))
      return jsonError('Internal error', 500)
    }
  },
}

// Token-gated read. Auth failures are logged to the platform only (no D1 write)
// to avoid letting unauthenticated traffic amplify into audit-table writes.
async function withTokenRead(request: Request, env: Env, handler: () => Promise<Response>): Promise<Response> {
  const auth = verifyToken(request, env)
  if (!auth.ok) return jsonError(auth.reason, auth.status)
  return handler()
}

// Token + replay gated mutation with audit. Used by SP-4 shadow (no kill-switch check —
// shadow scoring never places trades and must not be blocked by a trading pause).
async function withTokenMutation(
  request: Request,
  env: Env,
  action: string,
  handler: (req: Request) => Promise<Response>,
): Promise<Response> {
  const requestId = newRequestId()
  const tok = verifyToken(request, env)
  if (!tok.ok) return jsonError(tok.reason, tok.status)
  const gate = await authenticateMutation(request, env)
  if (!gate.ok) {
    await appendAudit(env.SIGNALPILOT_DB, { actor: 'system', action, outcome: 'deny', detail: { reason: gate.reason }, requestId })
    return jsonError(gate.reason, gate.status, { requestId })
  }
  const result = await handler(request)
  return result
}

async function readReason(request: Request): Promise<string | null> {
  try {
    const body = (await request.json()) as { reason?: unknown } | null
    const r = body?.reason
    return typeof r === 'string' && r.trim() ? r.trim().slice(0, 500) : null
  } catch {
    return null
  }
}

async function handleKill(request: Request, env: Env, disable: boolean): Promise<Response> {
  const requestId = newRequestId()
  const action = disable ? 'kill_switch.set' : 'kill_switch.clear'

  // Hard auth failure (bad/no token): platform log only, no D1 write.
  const tok = verifyToken(request, env)
  if (!tok.ok) return jsonError(tok.reason, tok.status)

  // Token valid but replay guard failed → audit the denial (trusted caller).
  const gate = await authenticateMutation(request, env)
  if (!gate.ok) {
    await appendAudit(env.SIGNALPILOT_DB, { actor: 'user', action, outcome: 'deny', detail: { reason: gate.reason }, requestId })
    return jsonError(gate.reason, gate.status, { requestId })
  }

  const reason = await readReason(request)
  await setTradingDisabled(env, disable, 'user', reason)
  const hash = await appendAudit(env.SIGNALPILOT_DB, {
    actor: 'user',
    action,
    outcome: 'ok',
    resource: 'trading_disabled',
    detail: { value: disable ? '1' : '0', reason },
    requestId,
  })

  return json({ tradingDisabled: disable, requestId, auditHash: hash })
}

async function handleIntent(request: Request, env: Env): Promise<Response> {
  const requestId = newRequestId()

  const tok = verifyToken(request, env)
  if (!tok.ok) return jsonError(tok.reason, tok.status)

  const gate = await authenticateMutation(request, env)
  if (!gate.ok) {
    await appendAudit(env.SIGNALPILOT_DB, { actor: 'user', action: 'trade.intent', outcome: 'deny', detail: { reason: gate.reason }, requestId })
    return jsonError(gate.reason, gate.status, { requestId })
  }

  if (await isTradingDisabled(env)) {
    await appendAudit(env.SIGNALPILOT_DB, { actor: 'user', action: 'trade.intent', outcome: 'deny', detail: { reason: 'trading_disabled' }, requestId })
    return jsonError('Trading is disabled (kill switch active)', 423, { requestId })
  }

  let body: { ticker?: unknown; signalDate?: unknown } | null = null
  try {
    const raw: unknown = await request.json()
    if (raw != null && typeof raw === 'object') body = raw as { ticker?: unknown; signalDate?: unknown }
  } catch { /* ignore */ }
  const ticker = body != null && typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : null
  const signalDate = body != null && typeof body.signalDate === 'string' ? body.signalDate.trim() : null

  if (!ticker || !signalDate) {
    return jsonError('Missing ticker or signalDate', 400, { requestId })
  }

  const result = await runIntent(env, { ticker, signalDate, requestId })

  await appendAudit(env.SIGNALPILOT_DB, {
    actor: 'user',
    action: 'trade.intent',
    outcome: result.intent.eligibility_status === 'APPROVED' ? 'allow' : 'deny',
    resource: `${ticker}/${signalDate}`,
    detail: {
      eligibility_status: result.intent.eligibility_status,
      rejection_reason: result.intent.rejection_reason,
      fill_price_cents: result.fill?.fill_price_cents ?? null,
      qty: result.fill?.qty ?? null,
      price_source: result.fill?.price_source ?? null,
    },
    requestId,
  })

  return json({ requestId, ...result })
}

async function handleSp2Batch(request: Request, env: Env): Promise<Response> {
  const requestId = newRequestId()

  const tok = verifyToken(request, env)
  if (!tok.ok) return jsonError(tok.reason, tok.status)

  const gate = await authenticateMutation(request, env)
  if (!gate.ok) {
    await appendAudit(env.SIGNALPILOT_DB, { actor: 'system', action: 'sp2.batch', outcome: 'deny', detail: { reason: gate.reason }, requestId })
    return jsonError(gate.reason, gate.status, { requestId })
  }

  if (await isTradingDisabled(env)) {
    await appendAudit(env.SIGNALPILOT_DB, { actor: 'system', action: 'sp2.batch', outcome: 'deny', detail: { reason: 'trading_disabled' }, requestId })
    return jsonError('Trading is disabled (kill switch active)', 423, { requestId })
  }

  let batchDate: string
  try {
    const raw = (await request.json()) as { date?: unknown }
    batchDate = typeof raw?.date === 'string' ? raw.date.trim() : new Date().toISOString().slice(0, 10)
  } catch {
    batchDate = new Date().toISOString().slice(0, 10)
  }

  const result = await runDailyBatch(env, { batchDate })

  await appendAudit(env.SIGNALPILOT_DB, {
    actor: 'system', action: 'sp2.batch', outcome: 'allow',
    resource: batchDate,
    detail: {
      entries: result.entries.filter(e => e.decision === 'APPROVED').length,
      rejected: result.entries.filter(e => e.decision === 'REJECTED').length,
      exits: result.exits.length,
      nav_cents: result.navCents,
    },
    requestId,
  })

  return json({ requestId, ...result })
}

async function handlePreflight(request: Request, env: Env): Promise<Response> {
  const requestId = newRequestId()

  const tok = verifyToken(request, env)
  if (!tok.ok) return jsonError(tok.reason, tok.status)

  const gate = await authenticateMutation(request, env)
  if (!gate.ok) {
    await appendAudit(env.SIGNALPILOT_DB, { actor: 'user', action: 'trade.preflight', outcome: 'deny', detail: { reason: gate.reason }, requestId })
    return jsonError(gate.reason, gate.status, { requestId })
  }

  // Fail-closed: no trade may proceed while trading is disabled.
  if (await isTradingDisabled(env)) {
    await appendAudit(env.SIGNALPILOT_DB, { actor: 'user', action: 'trade.preflight', outcome: 'deny', detail: { reason: 'trading_disabled' }, requestId })
    return jsonError('Trading is disabled (kill switch active)', 423, { requestId })
  }

  await appendAudit(env.SIGNALPILOT_DB, { actor: 'user', action: 'trade.preflight', outcome: 'allow', requestId })
  return json({ wouldProceed: true, requestId, note: 'SP-0 preflight only — no trade executed' })
}
