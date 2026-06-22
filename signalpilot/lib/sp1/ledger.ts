// Append-only cash ledger with stored running balance for fast reads.
import type { CashEntry } from './types'

export async function getBalance(db: D1Database, accountId: string): Promise<number> {
  const row = await db
    .prepare('SELECT running_balance_cents FROM cash_ledger WHERE account_id = ? ORDER BY ts DESC, id DESC LIMIT 1')
    .bind(accountId)
    .first<{ running_balance_cents: number }>()
  return row?.running_balance_cents ?? 0
}

export async function appendCash(
  db: D1Database,
  entry: Omit<CashEntry, 'running_balance_cents'>,
): Promise<CashEntry> {
  const prev = await getBalance(db, entry.account_id)
  const running = prev + entry.amount_cents
  await db
    .prepare(`
      INSERT INTO cash_ledger
        (id, account_id, ts, entry_type, amount_cents, running_balance_cents, reference_id, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      entry.id, entry.account_id, entry.ts, entry.entry_type,
      entry.amount_cents, running,
      entry.reference_id ?? null, entry.description ?? null,
    )
    .run()
  return { ...entry, running_balance_cents: running }
}

export async function listCash(db: D1Database, accountId: string, limit = 50): Promise<CashEntry[]> {
  const { results } = await db
    .prepare('SELECT * FROM cash_ledger WHERE account_id = ? ORDER BY ts DESC, id DESC LIMIT ?')
    .bind(accountId, limit)
    .all<CashEntry>()
  return results
}
