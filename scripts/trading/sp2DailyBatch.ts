/**
 * SP-2 daily batch trigger — runs in GitHub Actions after the snapshot build.
 *
 * Calls POST /api/sp2/batch on the SignalPilot Worker, which:
 *   1. Pulls today's eligible signals from TRADING_ETF_DB_RO
 *   2. Checks exit conditions for all open positions
 *   3. Runs eligibility → risk → sizing for each new signal
 *   4. Writes fills, cash entries, lots, and candidate_decisions to signalpilot-db
 *   5. Returns a DailyBatchResult summary
 *
 * Run: SP_AUTH_TOKEN=… node --import tsx scripts/trading/sp2DailyBatch.ts
 */

const SP_WORKER_URL = process.env.SP_WORKER_URL
  || 'https://signalpilot.skagaza486.workers.dev'
const SP_AUTH_TOKEN = process.env.SP_AUTH_TOKEN
const BATCH_DATE = process.env.BATCH_DATE || new Date().toISOString().slice(0, 10)

async function main(): Promise<void> {
  if (!SP_AUTH_TOKEN) {
    console.error('Missing SP_AUTH_TOKEN env var')
    process.exit(1)
  }

  const ts = Date.now()
  const nonce = `sp2-batch-${BATCH_DATE}-${Math.random().toString(36).slice(2)}`
  const url = `${SP_WORKER_URL}/api/sp2/batch`

  console.log(`SP-2 daily batch: date=${BATCH_DATE}, url=${url}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SP_AUTH_TOKEN}`,
      'X-SP-Timestamp': String(ts),
      'X-SP-Nonce': nonce,
    },
    body: JSON.stringify({ date: BATCH_DATE }),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error(`Batch failed ${res.status}: ${text}`)
    process.exit(2)
  }

  const result = JSON.parse(text) as {
    batchDate: string
    entries: Array<{ ticker: string; decision: string; code?: string }>
    exits: Array<{ ticker: string; reason: string; realizedPnlCents: number }>
    navCents: number
    cashCents: number
    openPositions: number
    policyVersion: string
  }

  const approved = result.entries.filter(e => e.decision === 'APPROVED')
  const rejected = result.entries.filter(e => e.decision === 'REJECTED')

  console.log(`\n=== SP-2 Batch Summary (${result.batchDate}) ===`)
  console.log(`Policy: v${result.policyVersion}`)
  console.log(`Entries approved: ${approved.length}`)
  if (approved.length > 0) {
    for (const e of approved) console.log(`  + ${e.ticker}`)
  }
  console.log(`Entries rejected: ${rejected.length}`)
  if (rejected.length > 0) {
    const byCode = Map.groupBy(rejected, r => r.code ?? 'UNKNOWN')
    for (const [code, group] of byCode) {
      console.log(`  - ${code}: ${group.map(r => r.ticker).join(', ')}`)
    }
  }
  console.log(`Exits: ${result.exits.length}`)
  for (const e of result.exits) {
    const pnl = (e.realizedPnlCents / 100).toFixed(2)
    console.log(`  x ${e.ticker} [${e.reason}] P&L $${pnl}`)
  }
  console.log(`NAV: $${(result.navCents / 100).toFixed(2)} | Cash: $${(result.cashCents / 100).toFixed(2)} | Open: ${result.openPositions}`)
  console.log('========================================\n')
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
