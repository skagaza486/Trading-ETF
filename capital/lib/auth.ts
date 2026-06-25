// Authentication for Capital Manager mutation endpoints.
//
// Auth model: single-user bearer token (env.CAPITAL_AUTH_TOKEN, a server-side
// secret). Constant-time compare to prevent timing attacks.
// Token is never logged or exposed in response bodies.

/**
 * Constant-time string comparison using XOR-based accumulator.
 * Never use === for secret comparison.
 *
 * Compares lengths by folding into the XOR accumulator rather than
 * early-returning, so a length mismatch is indistinguishable from a
 * value mismatch.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  let diff = ab.length ^ bb.length
  const len = Math.max(ab.length, bb.length)
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  }
  return diff === 0
}

function extractBearer(request: Request): string {
  const h = request.headers.get('Authorization') ?? ''
  return h.startsWith('Bearer ') ? h.slice(7) : ''
}

/**
 * Verify the bearer token against the stored secret.
 * Constant-time compare — never use === for secrets.
 */
export function verifyToken(request: Request, env: Env): boolean {
  if (!env.CAPITAL_AUTH_TOKEN) {
    // No token configured → fail closed. We never run "open".
    return false
  }
  const presented = extractBearer(request)
  if (!presented) return false
  return timingSafeEqual(presented, env.CAPITAL_AUTH_TOKEN)
}

/**
 * Helper: return 401 Response if token is invalid, or null if authenticated.
 * Use this at the top of every authenticated endpoint handler.
 */
export function requireAuth(request: Request, env: Env): Response | null {
  if (!verifyToken(request, env)) {
    const origin = request.headers.get('Origin') ?? null
    const allowedOrigins = [
      'https://trading-etf.skagaza486.workers.dev',
      'http://localhost:5173',
      'http://localhost:8787',
      'http://localhost:8788',
      'https://capital.skagaza486.workers.dev',
    ]
    const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : 'null'
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      },
    )
  }
  return null
}
