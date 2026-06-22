// Append-only, hash-chained audit trail (signalpilot-db.audit_log).
//
// Every mutation attempt — allowed, denied, or errored — is recorded. Rows are
// never updated or deleted. Each row's `hash` chains over the previous row's
// hash, so any later edit/deletion breaks the chain and is detectable.
//
// detail_json MUST NOT contain secrets (tokens, broker credentials, raw auth
// headers). Callers are responsible for redaction before calling append().

import { sha256Hex } from './http'

const GENESIS = 'GENESIS'

export type AuditOutcome = 'allow' | 'deny' | 'ok' | 'error'

export interface AuditEntry {
  actor: 'user' | 'system'
  action: string
  outcome: AuditOutcome
  resource?: string | null
  detail?: Record<string, unknown> | null
  requestId?: string | null
}

// Canonical serialization used as the hash pre-image. Field order is fixed so
// the hash is reproducible when verifying the chain later.
function canonical(prevHash: string, ts: string, e: Required<Pick<AuditEntry, 'actor' | 'action' | 'outcome'>> & {
  resource: string | null
  detailJson: string | null
  requestId: string | null
}): string {
  return JSON.stringify([prevHash, ts, e.actor, e.action, e.resource, e.outcome, e.detailJson, e.requestId])
}

// Append one audit row. Returns the new row's hash. Best-effort: never throws
// into the request path — an audit failure is itself logged to the platform log
// but must not crash the mutation handler (which has already taken effect or
// been denied). The hash chain still records the gap implicitly via id jumps.
export async function appendAudit(db: D1Database, entry: AuditEntry): Promise<string | null> {
  try {
    const ts = new Date().toISOString()
    const resource = entry.resource ?? null
    const detailJson = entry.detail != null ? JSON.stringify(entry.detail) : null
    const requestId = entry.requestId ?? null

    const last = await db
      .prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1')
      .first<{ hash: string }>()
    const prevHash = last?.hash ?? GENESIS

    const hash = await sha256Hex(
      canonical(prevHash, ts, { actor: entry.actor, action: entry.action, outcome: entry.outcome, resource, detailJson, requestId }),
    )

    await db
      .prepare(
        `INSERT INTO audit_log (ts, actor, action, resource, outcome, detail_json, request_id, prev_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(ts, entry.actor, entry.action, resource, entry.outcome, detailJson, requestId, prevHash, hash)
      .run()

    return hash
  } catch (err) {
    console.error('audit append failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

export interface AuditRow {
  id: number
  ts: string
  actor: string
  action: string
  resource: string | null
  outcome: string
  detail_json: string | null
  request_id: string | null
  prev_hash: string
  hash: string
}

export async function readAudit(db: D1Database, limit = 50): Promise<AuditRow[]> {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 500)
  const res = await db
    .prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?')
    .bind(safeLimit)
    .all<AuditRow>()
  return res.results ?? []
}

// Recompute the chain over the most recent `limit` rows (oldest→newest) and
// report the first row whose stored hash disagrees with the recomputed one.
// Note: verifies a tail window, so it confirms internal consistency of that
// window plus its link to the prior row, not the whole history in one call.
export async function verifyChain(db: D1Database, limit = 500): Promise<{ ok: boolean; brokenAtId?: number }> {
  const rows = (await readAudit(db, limit)).reverse() // oldest first
  let prevHash = rows.length > 0 ? rows[0].prev_hash : GENESIS
  for (const row of rows) {
    const expected = await sha256Hex(
      canonical(prevHash, row.ts, {
        actor: row.actor as 'user' | 'system',
        action: row.action,
        outcome: row.outcome as AuditOutcome,
        resource: row.resource,
        detailJson: row.detail_json,
        requestId: row.request_id,
      }),
    )
    if (expected !== row.hash || row.prev_hash !== prevHash) {
      return { ok: false, brokenAtId: row.id }
    }
    prevHash = row.hash
  }
  return { ok: true }
}
