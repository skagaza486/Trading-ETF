// SP-2 daily batch orchestration — called from Worker POST /api/sp2/batch.
//
// Flow: load signals + portfolio → exits → entries → strategy snapshot.
// All monetary values in cents. Whole shares only.
import { SP2_POLICY } from './policy'
import { checkEligibility } from './eligibilityEngine'
import { sizePosition } from './positionSizer'
import { checkRisk } from './tradingRiskEngine'
import { checkExitTrigger } from './exitEngine'
import { appendCash, getBalance } from '../sp1/ledger'
import { PAPER_ACCOUNT_ID, TARGET_NOTIONAL_CENTS } from '../sp1/types'
import type {
  CandidateSignal,
  OpenLotRow,
  BatchEntryRecord,
  ExitRecord,
  DailyBatchResult,
  RejectionLayer,
} from './types'

interface BatchEnv {
  SIGNALPILOT_DB: D1Database
  TRADING_ETF_DB_RO: D1Database
}

export async function runDailyBatch(
  env: BatchEnv,
  params: { batchDate: string; accountId?: string },
): Promise<DailyBatchResult> {
  const accountId = params.accountId ?? PAPER_ACCOUNT_ID
  const { batchDate } = params
  const policy = SP2_POLICY
  const now = new Date().toISOString()

  // 1. Today's eligible signals with price data
  const { results: rawSignals } = await env.TRADING_ETF_DB_RO.prepare(`
    SELECT rowid, ticker, signal_date, label, close_at_signal, next_open,
           earnings_in_window, atr_at_signal
    FROM signals
    WHERE signal_date = ?
      AND label IN ('LONG_BREAK','LONG_VCP','LONG_BOUNCE')
      AND close_at_signal IS NOT NULL
    ORDER BY ticker ASC
  `).bind(batchDate).all()
  const signals = rawSignals as unknown as CandidateSignal[]

  // 2. Open positions aggregated by ticker
  const { results: rawLots } = await env.SIGNALPILOT_DB.prepare(`
    SELECT
      ticker,
      SUM(qty - closed_qty)                                              AS net_qty,
      SUM((qty - closed_qty) * cost_basis_cents)                         AS total_cost_cents,
      CAST(SUM((qty - closed_qty) * cost_basis_cents) AS REAL)
        / NULLIF(SUM(qty - closed_qty), 0)                               AS avg_cost_cents,
      MIN(open_date)                                                     AS earliest_open_date,
      MAX(atr_at_entry)                                                  AS atr_at_entry,
      MAX(sector)                                                        AS sector
    FROM position_lots
    WHERE account_id = ? AND status IN ('OPEN','PARTIAL')
    GROUP BY ticker
    HAVING SUM(qty - closed_qty) > 0
  `).bind(accountId).all()
  const openLots = rawLots as unknown as OpenLotRow[]
  const openTickers = new Set(openLots.map(l => l.ticker))

  // 3. Sector map from latest universe snapshot (used for exposure cap)
  const sectorMap = new Map<string, string>()
  const allTickers = [...new Set([...signals.map(s => s.ticker), ...openLots.map(l => l.ticker)])]
  if (allTickers.length > 0) {
    const ph = allTickers.map(() => '?').join(',')
    const { results: sectorRows } = await env.TRADING_ETF_DB_RO.prepare(`
      SELECT ticker, sector FROM watchlist_universe_snapshots
      WHERE snapshot_month = (SELECT MAX(snapshot_month) FROM watchlist_universe_snapshots)
        AND ticker IN (${ph})
    `).bind(...allTickers).all()
    for (const row of sectorRows as Array<{ ticker: string; sector: string }>) {
      if (row.ticker && row.sector) sectorMap.set(row.ticker, row.sector)
    }
  }

  let cashCents = await getBalance(env.SIGNALPILOT_DB, accountId)
  // Cost-basis NAV: cash + open position cost
  const costBasisCents = openLots.reduce((s, l) => s + l.total_cost_cents, 0)
  let navCents = cashCents + costBasisCents

  // 4. Process exits first (frees slot counts before entries)
  const exitRecords: ExitRecord[] = []
  let realizedPnlCents = 0
  const workingLots = [...openLots] // mutable copy updated as exits are processed

  for (const lot of openLots) {
    const priceRow = await env.TRADING_ETF_DB_RO.prepare(`
      SELECT close_at_signal FROM signals
      WHERE ticker = ? AND close_at_signal IS NOT NULL
      ORDER BY signal_date DESC LIMIT 1
    `).bind(lot.ticker).first<{ close_at_signal: number }>()

    if (!priceRow?.close_at_signal) continue

    const currentPriceCents = Math.round(priceRow.close_at_signal * 100)
    const { trigger, holdingDays } = checkExitTrigger(lot, currentPriceCents, batchDate, policy)
    if (!trigger) continue

    const grossCents = currentPriceCents * lot.net_qty
    const pnlCents = grossCents - lot.total_cost_cents

    const intentId = crypto.randomUUID()
    await env.SIGNALPILOT_DB.prepare(`
      INSERT OR IGNORE INTO trade_intents
        (id, account_id, ticker, direction, signal_date, signal_label, source_signal_id,
         target_notional_cents, eligibility_status, rejection_reason, created_at, created_by)
      VALUES (?, ?, ?, 'SELL', ?, 'EXIT', NULL, ?, 'APPROVED', ?, ?, 'sp2-batch')
    `).bind(intentId, accountId, lot.ticker, batchDate, lot.total_cost_cents, trigger, now).run()

    const orderId = crypto.randomUUID()
    await env.SIGNALPILOT_DB.prepare(`
      INSERT INTO broker_orders
        (id, intent_id, account_id, ticker, side, order_type, qty, status, submitted_at, adapter)
      VALUES (?, ?, ?, ?, 'SELL', 'MARKET', ?, 'FILLED', ?, 'paper')
    `).bind(orderId, intentId, accountId, lot.ticker, lot.net_qty, now).run()

    const fillId = crypto.randomUUID()
    await env.SIGNALPILOT_DB.prepare(`
      INSERT INTO fills
        (id, order_id, account_id, ticker, side, fill_date, fill_price_cents, qty,
         gross_cents, commission_cents, net_cents, price_source, created_at)
      VALUES (?, ?, ?, ?, 'SELL', ?, ?, ?, ?, 0, ?, 'close_signal', ?)
    `).bind(fillId, orderId, accountId, lot.ticker, batchDate,
       currentPriceCents, lot.net_qty, grossCents, grossCents, now).run()

    await closeLotsFifo(env.SIGNALPILOT_DB, accountId, lot.ticker, lot.net_qty, batchDate, pnlCents)

    const cashEntry = await appendCash(env.SIGNALPILOT_DB, {
      id: crypto.randomUUID(), account_id: accountId, ts: now,
      entry_type: 'FILL_SELL', amount_cents: grossCents, reference_id: fillId,
      description: `SELL ${lot.net_qty} ${lot.ticker} @ $${(currentPriceCents / 100).toFixed(2)} [${trigger}]`,
    })
    cashCents = cashEntry.running_balance_cents

    await env.SIGNALPILOT_DB.prepare(`
      INSERT INTO order_events (id, order_id, event_type, ts, detail_json)
      VALUES (?, ?, 'FILLED', ?, ?)
    `).bind(crypto.randomUUID(), orderId, now,
       JSON.stringify({ trigger, holding_days: holdingDays, exit_price_cents: currentPriceCents })).run()

    openTickers.delete(lot.ticker)
    const idx = workingLots.findIndex(l => l.ticker === lot.ticker)
    if (idx >= 0) workingLots.splice(idx, 1)
    realizedPnlCents += pnlCents
    navCents = navCents - lot.total_cost_cents + grossCents

    exitRecords.push({
      ticker: lot.ticker, qty: lot.net_qty, reason: trigger,
      holdingTradingDays: holdingDays, costBasisCents: lot.total_cost_cents,
      exitPriceCents: currentPriceCents, realizedPnlCents: pnlCents, intentId,
    })
  }

  // 5. Process entries
  const entryRecords: BatchEntryRecord[] = []
  let newPositionsToday = 0

  for (const signal of signals) {
    const elig = checkEligibility(signal, openTickers, batchDate, policy)
    if (!elig.eligible) {
      await recordDecision(env.SIGNALPILOT_DB, {
        batchDate, accountId, signal, decision: 'REJECTED',
        layer: elig.layer, code: elig.code, intentId: null, policyVersion: policy.version, now,
      })
      entryRecords.push({
        ticker: signal.ticker, signalLabel: signal.label, signalDate: signal.signal_date,
        decision: 'REJECTED', layer: elig.layer, code: elig.code,
      })
      continue
    }

    const sector = sectorMap.get(signal.ticker) ?? null
    const risk = checkRisk(signal.ticker, sector, workingLots, newPositionsToday, navCents, policy)
    if (!risk.approved) {
      await recordDecision(env.SIGNALPILOT_DB, {
        batchDate, accountId, signal, decision: 'REJECTED',
        layer: 'RISK', code: risk.code, intentId: null, policyVersion: policy.version, now,
      })
      entryRecords.push({
        ticker: signal.ticker, signalLabel: signal.label, signalDate: signal.signal_date,
        decision: 'REJECTED', layer: 'RISK', code: risk.code,
      })
      continue
    }

    const rawPrice = signal.next_open ?? signal.close_at_signal!
    const fillPriceCents = Math.round(rawPrice * (1 + 10 / 10_000) * 100)
    const sizing = sizePosition(fillPriceCents, policy)
    if (!sizing.approved) {
      await recordDecision(env.SIGNALPILOT_DB, {
        batchDate, accountId, signal, decision: 'REJECTED',
        layer: 'SIZING', code: sizing.code, intentId: null, policyVersion: policy.version, now,
      })
      entryRecords.push({
        ticker: signal.ticker, signalLabel: signal.label, signalDate: signal.signal_date,
        decision: 'REJECTED', layer: 'SIZING', code: sizing.code,
      })
      continue
    }

    const grossCents = fillPriceCents * sizing.qty
    if (grossCents > cashCents) {
      await recordDecision(env.SIGNALPILOT_DB, {
        batchDate, accountId, signal, decision: 'REJECTED',
        layer: 'RISK', code: 'INSUFFICIENT_CASH', intentId: null, policyVersion: policy.version, now,
      })
      entryRecords.push({
        ticker: signal.ticker, signalLabel: signal.label, signalDate: signal.signal_date,
        decision: 'REJECTED', layer: 'RISK', code: 'INSUFFICIENT_CASH',
      })
      continue
    }

    const intentId = crypto.randomUUID()
    await env.SIGNALPILOT_DB.prepare(`
      INSERT OR IGNORE INTO trade_intents
        (id, account_id, ticker, direction, signal_date, signal_label, source_signal_id,
         target_notional_cents, eligibility_status, rejection_reason, created_at, created_by)
      VALUES (?, ?, ?, 'LONG', ?, ?, ?, ?, 'APPROVED', NULL, ?, 'sp2-batch')
    `).bind(intentId, accountId, signal.ticker, signal.signal_date, signal.label,
       signal.rowid, TARGET_NOTIONAL_CENTS, now).run()

    const orderId = crypto.randomUUID()
    await env.SIGNALPILOT_DB.prepare(`
      INSERT INTO broker_orders
        (id, intent_id, account_id, ticker, side, order_type, qty, status, submitted_at, adapter)
      VALUES (?, ?, ?, ?, 'BUY', 'MARKET', ?, 'FILLED', ?, 'paper')
    `).bind(orderId, intentId, accountId, signal.ticker, sizing.qty, now).run()

    const fillId = crypto.randomUUID()
    const priceSource = signal.next_open ? 'next_open' : 'close_fallback'
    await env.SIGNALPILOT_DB.prepare(`
      INSERT INTO fills
        (id, order_id, account_id, ticker, side, fill_date, fill_price_cents, qty,
         gross_cents, commission_cents, net_cents, price_source, created_at)
      VALUES (?, ?, ?, ?, 'BUY', ?, ?, ?, ?, 0, ?, ?, ?)
    `).bind(fillId, orderId, accountId, signal.ticker, signal.signal_date,
       fillPriceCents, sizing.qty, grossCents, -grossCents, priceSource, now).run()

    const cashEntry = await appendCash(env.SIGNALPILOT_DB, {
      id: crypto.randomUUID(), account_id: accountId, ts: now,
      entry_type: 'FILL_BUY', amount_cents: -grossCents, reference_id: fillId,
      description: `BUY ${sizing.qty} ${signal.ticker} @ $${(fillPriceCents / 100).toFixed(2)} [${priceSource}]`,
    })
    cashCents = cashEntry.running_balance_cents

    await env.SIGNALPILOT_DB.prepare(`
      INSERT INTO position_lots
        (id, account_id, ticker, fill_id, open_date, qty, cost_basis_cents,
         closed_qty, status, atr_at_entry, sector)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'OPEN', ?, ?)
    `).bind(crypto.randomUUID(), accountId, signal.ticker, fillId, signal.signal_date,
       sizing.qty, grossCents, signal.atr_at_signal ?? null, sector).run()

    await env.SIGNALPILOT_DB.prepare(`
      INSERT INTO order_events (id, order_id, event_type, ts, detail_json)
      VALUES (?, ?, 'FILLED', ?, ?)
    `).bind(crypto.randomUUID(), orderId, now,
       JSON.stringify({ fill_price_cents: fillPriceCents, price_source: priceSource })).run()

    await recordDecision(env.SIGNALPILOT_DB, {
      batchDate, accountId, signal, decision: 'APPROVED',
      layer: undefined, code: undefined, intentId, policyVersion: policy.version, now,
    })

    openTickers.add(signal.ticker)
    workingLots.push({
      ticker: signal.ticker, net_qty: sizing.qty,
      total_cost_cents: grossCents, avg_cost_cents: fillPriceCents,
      earliest_open_date: signal.signal_date,
      atr_at_entry: signal.atr_at_signal ?? null, sector,
    })
    navCents += grossCents
    newPositionsToday++

    entryRecords.push({
      ticker: signal.ticker, signalLabel: signal.label, signalDate: signal.signal_date,
      decision: 'APPROVED', intentId,
    })
  }

  // 6. Final NAV + strategy snapshot
  const finalNavRow = await env.SIGNALPILOT_DB.prepare(`
    SELECT SUM((qty - closed_qty) * cost_basis_cents) AS cost_basis
    FROM position_lots
    WHERE account_id = ? AND status IN ('OPEN','PARTIAL')
  `).bind(accountId).first<{ cost_basis: number | null }>()
  const marketValueCents = finalNavRow?.cost_basis ?? 0
  const finalNavCents = cashCents + marketValueCents

  const posCountRow = await env.SIGNALPILOT_DB.prepare(`
    SELECT COUNT(DISTINCT ticker) AS cnt
    FROM position_lots
    WHERE account_id = ? AND status IN ('OPEN','PARTIAL')
  `).bind(accountId).first<{ cnt: number }>()
  const openPositions = posCountRow?.cnt ?? 0

  await env.SIGNALPILOT_DB.prepare(`
    INSERT OR REPLACE INTO strategy_daily_snapshots
      (id, snapshot_date, account_id, cash_cents, market_value_cents, nav_cents,
       open_positions, new_entries, rejected_entries, exits_executed,
       realized_pnl_cents, policy_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), batchDate, accountId, cashCents, marketValueCents, finalNavCents,
    openPositions, newPositionsToday,
    entryRecords.filter(e => e.decision === 'REJECTED').length,
    exitRecords.length, realizedPnlCents, policy.version, now,
  ).run()

  return {
    batchDate, entries: entryRecords, exits: exitRecords,
    navCents: finalNavCents, cashCents, openPositions, policyVersion: policy.version,
  }
}

async function closeLotsFifo(
  db: D1Database,
  accountId: string,
  ticker: string,
  sellQty: number,
  closeDate: string,
  totalPnlCents: number,
): Promise<void> {
  const { results: lots } = await db.prepare(`
    SELECT id, qty, closed_qty FROM position_lots
    WHERE account_id = ? AND ticker = ? AND status IN ('OPEN','PARTIAL')
    ORDER BY open_date ASC, id ASC
  `).bind(accountId, ticker).all()

  let remaining = sellQty
  for (const lot of lots as Array<{ id: string; qty: number; closed_qty: number }>) {
    if (remaining <= 0) break
    const available = lot.qty - lot.closed_qty
    const closing = Math.min(available, remaining)
    const newClosed = lot.closed_qty + closing
    const isFull = newClosed >= lot.qty
    const lotPnl = Math.round(totalPnlCents * (closing / sellQty))
    await db.prepare(`
      UPDATE position_lots SET closed_qty=?, close_date=?, realized_pnl_cents=?, status=?
      WHERE id=?
    `).bind(newClosed, closeDate, lotPnl, isFull ? 'CLOSED' : 'PARTIAL', lot.id).run()
    remaining -= closing
  }
}

async function recordDecision(
  db: D1Database,
  p: {
    batchDate: string; accountId: string; signal: CandidateSignal
    decision: 'APPROVED' | 'REJECTED'; layer?: RejectionLayer; code?: string
    intentId: string | null; policyVersion: string; now: string
  },
): Promise<void> {
  await db.prepare(`
    INSERT INTO candidate_decisions
      (id, decision_date, account_id, ticker, signal_label, signal_date,
       decision, rejection_layer, rejection_code, intent_id, policy_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), p.batchDate, p.accountId, p.signal.ticker,
    p.signal.label, p.signal.signal_date, p.decision,
    p.layer ?? null, p.code ?? null, p.intentId, p.policyVersion, p.now,
  ).run()
}
