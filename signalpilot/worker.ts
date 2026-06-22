// SignalPilot control-plane Worker (SP-0: Auth & Audit Spine).
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
