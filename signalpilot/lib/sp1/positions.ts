// FIFO position lot management (ADR-SP-003).
import type { FillRecord, PositionLot, AggregatedPosition } from './types'

export async function openLot(db: D1Database, fill: FillRecord): Promise<PositionLot> {
  const lot: PositionLot = {
    id: crypto.randomUUID(),
    account_id: fill.account_id,
    ticker: fill.ticker,
    fill_id: fill.id,
    open_date: fill.fill_date,
    qty: fill.qty,
    cost_basis_cents: fill.gross_cents,
    closed_qty: 0,
    close_date: null,
    realized_pnl_cents: null,
    status: 'OPEN',
  }
  await db
    .prepare(`
      INSERT INTO position_lots
        (id, account_id, ticker, fill_id, open_date, qty, cost_basis_cents,
         closed_qty, close_date, realized_pnl_cents, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'OPEN')
    `)
    .bind(lot.id, lot.account_id, lot.ticker, lot.fill_id, lot.open_date, lot.qty, lot.cost_basis_cents)
    .run()
  return lot
}

export async function getOpenPositions(db: D1Database, accountId: string): Promise<AggregatedPosition[]> {
  const { results } = await db
    .prepare(`
      SELECT
        ticker,
        SUM(qty - closed_qty) AS net_qty,
        SUM(cost_basis_cents) AS total_cost_cents
      FROM position_lots
      WHERE account_id = ? AND status IN ('OPEN', 'PARTIAL')
      GROUP BY ticker
      HAVING SUM(qty - closed_qty) > 0
      ORDER BY ticker
    `)
    .bind(accountId)
    .all<{ ticker: string; net_qty: number; total_cost_cents: number }>()

  return results.map(r => ({
    ticker: r.ticker,
    net_qty: r.net_qty,
    total_cost_cents: r.total_cost_cents,
    avg_cost_cents: Math.round(r.total_cost_cents / r.net_qty),
  }))
}
