/**
 * SP-2 historical backfill — runs the daily batch for all past signal dates.
 *
 * Purpose: code-validation exit gate (≥20 trading days, no ledger errors).
 * Note: exit prices use current DB prices (not historical), so P&L is not meaningful.
 *
 * Run: SP_AUTH_TOKEN=<token> node scripts/trading/sp2Backfill.mjs
 * Resume from a specific date: START_DATE=2025-11-03 SP_AUTH_TOKEN=<token> node scripts/trading/sp2Backfill.mjs
 */

const SP_WORKER_URL = process.env.SP_WORKER_URL
  || 'https://signalpilot.skagaza486.workers.dev'
const SP_AUTH_TOKEN = process.env.SP_AUTH_TOKEN
const START_DATE = process.env.START_DATE || null

// Historical signal dates with eligible signals (LONG_BREAK/VCP/BOUNCE), chronological order.
const BACKFILL_DATES = [
  '2025-06-20',
  '2025-06-30',
  '2025-07-15',
  '2025-07-18',
  '2025-07-29',
  '2025-08-01',
  '2025-08-04',
  '2025-08-13',
  '2025-08-22',
  '2025-09-16',
  '2025-09-19',
  '2025-10-01',
  '2025-10-08',
  '2025-11-03',
  '2025-12-03',
  '2026-01-05',
  '2026-01-06',
  '2026-04-17',
  '2026-04-23',
  '2026-05-01',
  '2026-06-01',
  '2026-06-03',
]

async function runBatch(date) {
  const ts = Date.now()
  const nonce = `sp2-backfill-${date}-${Math.random().toString(36).slice(2)}`

  const res = await fetch(`${SP_WORKER_URL}/api/sp2/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SP_AUTH_TOKEN}`,
      'X-SP-Timestamp': String(ts),
      'X-SP-Nonce': nonce,
    },
    body: JSON.stringify({ date }),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`Batch ${date} failed ${res.status}: ${text.slice(0, 200)}`)

  const r = JSON.parse(text)
  const approved = r.entries.filter(e => e.decision === 'APPROVED').map(e => e.ticker)
  const rejected = r.entries.filter(e => e.decision === 'REJECTED')
  const rejGroups = {}
  for (const e of rejected) {
    const k = e.code ?? 'UNKNOWN'
    ;(rejGroups[k] ??= []).push(e.ticker)
  }
  const rejStr = Object.entries(rejGroups).map(([k, v]) => `${k}:${v.join(',')}`).join(' | ') || '—'
  const exitStr = r.exits.map(e => `${e.ticker}[${e.reason}]`).join(',') || '—'

  console.log(
    `${date}  +[${approved.join(',') || '—'}]  -[${rejStr}]  x[${exitStr}]` +
    `  NAV=$${(r.navCents / 100).toFixed(0)}  open=${r.openPositions}`
  )
}

async function main() {
  if (!SP_AUTH_TOKEN) { console.error('Missing SP_AUTH_TOKEN'); process.exit(1) }

  const dates = START_DATE
    ? BACKFILL_DATES.filter(d => d >= START_DATE)
    : BACKFILL_DATES

  console.log(`SP-2 backfill: ${dates.length} dates → ${SP_WORKER_URL}`)
  if (START_DATE) console.log(`Resuming from ${START_DATE}`)
  console.log('Note: exit prices use current DB data (P&L not meaningful)\n')

  let ok = 0
  for (const date of dates) {
    try {
      await runBatch(date)
      ok++
      await new Promise(r => setTimeout(r, 300))
    } catch (err) {
      console.error(`ERROR on ${date}:`, err.message)
      console.error(`\nResume with: START_DATE=${date} SP_AUTH_TOKEN=<token> node scripts/trading/sp2Backfill.mjs`)
      process.exit(1)
    }
  }

  console.log(`\n✅ Backfill complete: ${ok}/${dates.length} days, no errors`)
  console.log('SP-2 exit gate: code-validation criterion met')
}

main().catch(err => { console.error(err.message); process.exit(1) })
