// Shared HTTP helpers for the SignalPilot control-plane Worker.

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

export function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return json({ error: message, ...extra }, status)
}

// Correlation id for one request — links the HTTP response to its audit rows.
export function newRequestId(): string {
  return crypto.randomUUID()
}

// Hex SHA-256 of a UTF-8 string. Used for the audit hash chain.
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time string comparison. Avoids leaking token length/prefix via timing.
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  // Compare lengths in constant time by folding into the accumulator rather than
  // early-returning, so a length mismatch is indistinguishable from a value mismatch.
  let diff = ab.length ^ bb.length
  const len = Math.max(ab.length, bb.length)
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  }
  return diff === 0
}
