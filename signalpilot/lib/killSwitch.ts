// Server-side kill switch — the flag every trade-mutating endpoint fails closed
// against. Durable source of truth is signalpilot-db.control_flags; KV is a
// low-latency mirror for the hot read path.
//
// Fail-closed: if we cannot positively determine that trading is ENABLED, we
// report it as DISABLED. A missing flag, a KV miss with a D1 error, or any
// unexpected value all resolve to "trading disabled".

const FLAG = 'trading_disabled'
const KV_KEY = 'control:trading_disabled'

// Returns true when trading is disabled (the safe default).
export async function isTradingDisabled(env: Env): Promise<boolean> {
  // 1. Hot path: KV mirror.
  try {
    const v = await env.SP_CONTROL_KV.get(KV_KEY)
    if (v === '0') return false
    if (v === '1') return true
    // KV miss → fall through to durable D1 and repopulate.
  } catch (err) {
    console.error('kill-switch KV read failed, falling back to D1:', err instanceof Error ? err.message : String(err))
  }

  // 2. Durable truth: D1 control_flags.
  try {
    const row = await env.SIGNALPILOT_DB
      .prepare('SELECT value FROM control_flags WHERE name = ?')
      .bind(FLAG)
      .first<{ value: string }>()
    if (row?.value === '0') {
      await safeKvPut(env, '0')
      return false
    }
    if (row?.value === '1') {
      await safeKvPut(env, '1')
      return true
    }
  } catch (err) {
    console.error('kill-switch D1 read failed:', err instanceof Error ? err.message : String(err))
  }

  // 3. Indeterminate → fail closed.
  return true
}

// Persist the flag: D1 first (durable), then KV mirror. Auditing is the
// caller's responsibility (it owns request context).
export async function setTradingDisabled(env: Env, disabled: boolean, updatedBy: 'user' | 'system', reason: string | null): Promise<void> {
  const value = disabled ? '1' : '0'
  await env.SIGNALPILOT_DB
    .prepare(
      `INSERT INTO control_flags (name, value, updated_at, updated_by, reason)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by, reason = excluded.reason`,
    )
    .bind(FLAG, value, new Date().toISOString(), updatedBy, reason)
    .run()
  await safeKvPut(env, value)
}

async function safeKvPut(env: Env, value: string): Promise<void> {
  try {
    await env.SP_CONTROL_KV.put(KV_KEY, value)
  } catch (err) {
    // D1 is the source of truth; a stale/missing KV mirror only costs a D1
    // fallback read next time, so a put failure is non-fatal.
    console.error('kill-switch KV mirror write failed:', err instanceof Error ? err.message : String(err))
  }
}
