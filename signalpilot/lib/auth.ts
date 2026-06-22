// Authentication + replay protection for SignalPilot mutation endpoints.
//
// Auth model: single-user bearer token (env.SP_AUTH_TOKEN, a server-side
// secret). Because the token is non-ambient (browsers never attach it
// automatically), classic CSRF does not apply — there are no cookies to ride.
// What remains is *replay* of a captured request, which we close with a
// signed-window timestamp + single-use nonce on every mutation.

import { timingSafeEqual } from './http'

export interface AuthFailure {
  ok: false
  status: number
  reason: string
}
export type AuthResult = { ok: true } | AuthFailure

// 120s clock-skew tolerance; nonces are remembered slightly longer to cover it.
const SKEW_MS = 120_000
const NONCE_TTL_SECONDS = 300

function extractBearer(request: Request): string {
  const h = request.headers.get('Authorization') ?? ''
  return h.startsWith('Bearer ') ? h.slice(7) : ''
}

// Verify the bearer token. Used by every authenticated route (reads + writes).
export function verifyToken(request: Request, env: Env): AuthResult {
  if (!env.SP_AUTH_TOKEN) {
    // No token configured → fail closed. We never run "open".
    return { ok: false, status: 503, reason: 'SP_AUTH_TOKEN not configured' }
  }
  const presented = extractBearer(request)
  if (!presented || !timingSafeEqual(presented, env.SP_AUTH_TOKEN)) {
    return { ok: false, status: 401, reason: 'Unauthorized' }
  }
  return { ok: true }
}

// Replay guard for mutations: requires a fresh timestamp and an unused nonce.
// Storing the nonce in KV with a TTL means a captured request can be replayed
// at most until the timestamp window closes, and the nonce blocks even that.
export async function replayGuard(request: Request, env: Env): Promise<AuthResult> {
  const tsRaw = request.headers.get('X-SP-Timestamp') ?? ''
  const nonce = request.headers.get('X-SP-Nonce') ?? ''

  const ts = Number(tsRaw)
  if (!tsRaw || !Number.isFinite(ts)) {
    return { ok: false, status: 400, reason: 'Missing or invalid X-SP-Timestamp (unix ms)' }
  }
  if (Math.abs(Date.now() - ts) > SKEW_MS) {
    return { ok: false, status: 401, reason: 'Request timestamp outside allowed window' }
  }
  if (!nonce || nonce.length < 8 || nonce.length > 128) {
    return { ok: false, status: 400, reason: 'Missing or invalid X-SP-Nonce' }
  }

  const key = `nonce:${nonce}`
  try {
    const seen = await env.SP_CONTROL_KV.get(key)
    if (seen) {
      return { ok: false, status: 409, reason: 'Replay detected (nonce already used)' }
    }
    await env.SP_CONTROL_KV.put(key, '1', { expirationTtl: NONCE_TTL_SECONDS })
  } catch (err) {
    // Cannot verify uniqueness → fail closed; better to reject than risk a replay.
    console.error('replay-guard KV failure:', err instanceof Error ? err.message : String(err))
    return { ok: false, status: 503, reason: 'Replay guard unavailable' }
  }
  return { ok: true }
}

// Full gate for a mutation request: token + replay. Stops at the first failure.
export async function authenticateMutation(request: Request, env: Env): Promise<AuthResult> {
  const tok = verifyToken(request, env)
  if (!tok.ok) return tok
  return replayGuard(request, env)
}
