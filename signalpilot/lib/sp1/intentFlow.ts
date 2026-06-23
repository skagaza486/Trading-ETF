// SP-001 end-to-end: signal → eligibility → paper fill → ledger → audit.
// All monetary values in cents. Whole shares only (SP-1 MVP).
//
// Flow: fetch signal → checkEligibility → simulateFill → size →
//       cash check → writeIntent → order → fill → appendCash → openLot → orderEvent
//
// Idempotency: UNIQUE (account_id, ticker, signal_date) on trade_intents.
// If the same signal is submitted twice the second INSERT OR IGNORE is a no-op;
// the caller gets back the original intent row.
//
// Known approximation: fill_date = signal_date (T instead of T+1).
// SP-2 will add a trading-calendar lookup to derive the correct next trading day.
import { checkEligibility } from './eligibility'
import { simulateFill } from '../brokers/paper'
import { appendCash, getBalance } from './ledger'
import { openLot } from './positions'
import {
  PAPER_ACCOUNT_ID,
  TARGET_NOTIONAL_CENTS,
  type IntentFlowResult,
  type IntentRecord,
  type OrderRecord,
  type FillRecord,
  type SignalRow,
} from './types'

interface FlowEnv {
  SIGNALPILOT_DB: D1Database
  TRADING_ETF_DB_RO: D1Database
}

export interface FlowParams {
  ticker: string
  signalDate: string
  accountId?: string
  requestId: string
}

export async function runIntent(env: FlowEnv, params: FlowParams): Promise<IntentFlowResult> {
  const accountId = params.accountId ?? PAPER_ACCOUNT_ID
  const now = new Date().toISOString()

  // Idempotency guard: if an intent already exists for this (account, ticker, signal_date),
  // return it immediately. Prevents FK violation from the INSERT OR IGNORE no-op path.
  const existingIntent = await env.SIGNALPILOT_DB.prepare(
    'SELECT * FROM trade_intents WHERE account_id = ? AND ticker = ? AND signal_date = ? LIMIT 1',
  ).bind(accountId, params.ticker, params.signalDate).first<IntentRecord>()
  if (existingIntent) {
    return { intent: existingIntent, order: null, fill: null, cash_balance_cents: await getBalance(env.SIGNALPILOT_DB, accountId) }
  }

  // 1. Fetch signal (read-only; never writes to TRADING_ETF_DB_RO)
  const signal = await env.TRADING_ETF_DB_RO.prepare(
    'SELECT rowid, ticker, signal_date, label, close_at_signal, next_open, earnings_in_window FROM signals WHERE ticker = ? AND signal_date = ? LIMIT 1',
  )
    .bind(params.ticker, params.signalDate)
    .first<SignalRow>()

  if (!signal) {
    const intent = await writeIntent(env.SIGNALPILOT_DB, {
      id: crypto.randomUUID(), accountId, ticker: params.ticker,
      signalDate: params.signalDate, label: 'UNKNOWN', sourceId: null,
      status: 'REJECTED', reason: 'SIGNAL_NOT_FOUND', now,
    })
    return { intent, order: null, fill: null, cash_balance_cents: await getBalance(env.SIGNALPILOT_DB, accountId) }
  }

  // 2. Eligibility check
  const elig = checkEligibility(signal)
  if (!elig.eligible) {
    const intent = await writeIntent(env.SIGNALPILOT_DB, {
      id: crypto.randomUUID(), accountId, ticker: params.ticker,
      signalDate: params.signalDate, label: signal.label, sourceId: signal.rowid,
      status: 'REJECTED', reason: elig.reason ?? 'INELIGIBLE', now,
    })
    return { intent, order: null, fill: null, cash_balance_cents: await getBalance(env.SIGNALPILOT_DB, accountId) }
  }

  // 3. Simulate paper fill price
  const sim = await simulateFill(env.TRADING_ETF_DB_RO, params.ticker, params.signalDate)

  // 4. Size position: whole shares, $1k target notional
  const qty = Math.floor(TARGET_NOTIONAL_CENTS / sim.fill_price_cents)
  if (qty === 0) {
    const intent = await writeIntent(env.SIGNALPILOT_DB, {
      id: crypto.randomUUID(), accountId, ticker: params.ticker,
      signalDate: params.signalDate, label: signal.label, sourceId: signal.rowid,
      status: 'REJECTED', reason: 'POSITION_TOO_SMALL', now,
    })
    return { intent, order: null, fill: null, cash_balance_cents: await getBalance(env.SIGNALPILOT_DB, accountId) }
  }

  // 5. Cash check
  const cashBefore = await getBalance(env.SIGNALPILOT_DB, accountId)
  const grossCents = sim.fill_price_cents * qty
  if (grossCents > cashBefore) {
    const intent = await writeIntent(env.SIGNALPILOT_DB, {
      id: crypto.randomUUID(), accountId, ticker: params.ticker,
      signalDate: params.signalDate, label: signal.label, sourceId: signal.rowid,
      status: 'REJECTED', reason: 'INSUFFICIENT_CASH', now,
    })
    return { intent, order: null, fill: null, cash_balance_cents: cashBefore }
  }

  // 6. Write APPROVED intent
  const intentId = crypto.randomUUID()
  const intent = await writeIntent(env.SIGNALPILOT_DB, {
    id: intentId, accountId, ticker: params.ticker,
    signalDate: params.signalDate, label: signal.label, sourceId: signal.rowid,
    status: 'APPROVED', reason: null, now,
  })

  // 7. Broker order (paper → immediately FILLED)
  const orderId = crypto.randomUUID()
  await env.SIGNALPILOT_DB.prepare(`
    INSERT INTO broker_orders
      (id, intent_id, account_id, ticker, side, order_type, qty, status, submitted_at, adapter, adapter_order_id)
    VALUES (?, ?, ?, ?, 'BUY', 'MARKET', ?, 'FILLED', ?, 'paper', NULL)
  `).bind(orderId, intentId, accountId, params.ticker, qty, now).run()

  const order: OrderRecord = {
    id: orderId, intent_id: intentId, account_id: accountId,
    ticker: params.ticker, side: 'BUY', order_type: 'MARKET', qty,
    status: 'FILLED', submitted_at: now, adapter: 'paper', adapter_order_id: null,
  }

  // 8. Immutable fill record
  const fillId = crypto.randomUUID()
  const fill: FillRecord = {
    id: fillId, order_id: orderId, account_id: accountId,
    ticker: params.ticker, side: 'BUY',
    fill_date: params.signalDate,  // approximation: T+1 open on signal date (see file header)
    fill_price_cents: sim.fill_price_cents, qty,
    gross_cents: grossCents, commission_cents: 0, net_cents: -grossCents,
    price_source: sim.price_source, created_at: now,
  }
  await env.SIGNALPILOT_DB.prepare(`
    INSERT INTO fills
      (id, order_id, account_id, ticker, side, fill_date, fill_price_cents, qty,
       gross_cents, commission_cents, net_cents, price_source, created_at)
    VALUES (?, ?, ?, ?, 'BUY', ?, ?, ?, ?, 0, ?, ?, ?)
  `).bind(
    fillId, orderId, accountId, params.ticker,
    fill.fill_date, sim.fill_price_cents, qty,
    grossCents, -grossCents, sim.price_source, now,
  ).run()

  // 9. Cash ledger (sequential: needs prior balance for running total)
  const cashEntry = await appendCash(env.SIGNALPILOT_DB, {
    id: crypto.randomUUID(), account_id: accountId, ts: now,
    entry_type: 'FILL_BUY', amount_cents: -grossCents,
    reference_id: fillId,
    description: `BUY ${qty} ${params.ticker} @ $${(sim.fill_price_cents / 100).toFixed(2)} [${sim.price_source}]`,
  })

  // 10. FIFO position lot
  await openLot(env.SIGNALPILOT_DB, fill)

  // 11. Order state event
  await env.SIGNALPILOT_DB.prepare(`
    INSERT INTO order_events (id, order_id, event_type, ts, detail_json)
    VALUES (?, ?, 'FILLED', ?, ?)
  `).bind(
    crypto.randomUUID(), orderId, now,
    JSON.stringify({ price_source: sim.price_source, fill_price_cents: sim.fill_price_cents }),
  ).run()

  return { intent, order, fill, cash_balance_cents: cashEntry.running_balance_cents }
}

async function writeIntent(
  db: D1Database,
  p: {
    id: string; accountId: string; ticker: string; signalDate: string
    label: string; sourceId: number | null; status: string; reason: string | null; now: string
  },
): Promise<IntentRecord> {
  await db.prepare(`
    INSERT OR IGNORE INTO trade_intents
      (id, account_id, ticker, direction, signal_date, signal_label, source_signal_id,
       target_notional_cents, eligibility_status, rejection_reason, created_at, created_by)
    VALUES (?, ?, ?, 'LONG', ?, ?, ?, ?, ?, ?, ?, 'system')
  `).bind(
    p.id, p.accountId, p.ticker, p.signalDate, p.label, p.sourceId ?? null,
    TARGET_NOTIONAL_CENTS, p.status, p.reason ?? null, p.now,
  ).run()

  return {
    id: p.id, account_id: p.accountId, ticker: p.ticker,
    direction: 'LONG', signal_date: p.signalDate, signal_label: p.label,
    source_signal_id: p.sourceId, target_notional_cents: TARGET_NOTIONAL_CENTS,
    eligibility_status: p.status, rejection_reason: p.reason,
    created_at: p.now, created_by: 'system',
  }
}
