/**
 * Export full signals from D1 (including indicators_json) for ML training.
 * Uses wrangler paginated queries since D1 caps at 5000 rows per query.
 *
 * Usage: node scripts/ml/export_signals_d1.mjs [--out data/signals_full.csv] [--label LONG_BREAK,LONG_VCP,LONG_BOUNCE]
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const WRANGLER = '.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler'
const PAGE_SIZE = 5000

function parseArgs(argv) {
  let out = 'data/signals_full.csv'
  let labels = ['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE']
  let allLabels = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i]
    if (argv[i] === '--label') labels = argv[++i].split(',')
    if (argv[i] === '--all-labels') allLabels = true
  }
  return { out, labels, allLabels }
}

function runQuery(sql) {
  const cmd = WRANGLER.split(' ')
  const args = [...cmd.slice(1), 'd1', 'execute', 'trading-etf-db', '--remote', '--command', sql]
  const raw = execFileSync(cmd[0], args, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
  const match = raw.match(/\[\s*\{[\s\S]*\}\s*\]/)
  if (!match) return []
  const parsed = JSON.parse(match[0])
  return parsed[0]?.results ?? []
}

function rowToCsv(row, headers) {
  return headers.map(h => {
    const v = row[h]
    if (v === null || v === undefined) return ''
    if (typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n'))) {
      return '"' + v.replace(/"/g, '""') + '"'
    }
    return String(v)
  }).join(',')
}

const args = parseArgs(process.argv.slice(2))
const labelFilter = args.allLabels ? '' : `AND label IN (${args.labels.map(l => `'${l}'`).join(',')})`

const COLS = 'ticker, signal_date, label, previous_label, regime, rs_rank, rsi14, rvol, rs_vs_spy, clv, ema50_slope, atr_at_signal, earnings_in_window, indicators_json, ret1d, ret3d, ret5d, ret10d, ret5d_vs_spy, ret10d_vs_spy, mfe5d, mae5d, mfe10d, mae10d, stop_loss_hit'

let allRows = []
let offset = 0
console.log(`Exporting signals (labels: ${args.allLabels ? 'ALL' : args.labels.join(',')}) …`)

while (true) {
  const sql = `SELECT ${COLS} FROM signals WHERE ret5d IS NOT NULL ${labelFilter} ORDER BY signal_date LIMIT ${PAGE_SIZE} OFFSET ${offset}`
  const rows = runQuery(sql)
  if (rows.length === 0) break
  allRows = allRows.concat(rows)
  console.log(`  fetched ${allRows.length} rows (offset=${offset})`)
  if (rows.length < PAGE_SIZE) break
  offset += PAGE_SIZE
}

if (allRows.length === 0) {
  console.error('No rows returned.')
  process.exit(1)
}

const headers = Object.keys(allRows[0])
const csvLines = [
  headers.join(','),
  ...allRows.map(r => rowToCsv(r, headers)),
]

mkdirSync(dirname(args.out), { recursive: true })
writeFileSync(args.out, csvLines.join('\n'))
console.log(`\nExported ${allRows.length} rows → ${args.out}`)
const labelDist = {}
for (const r of allRows) labelDist[r.label] = (labelDist[r.label] || 0) + 1
console.log('Label distribution:', JSON.stringify(labelDist))
