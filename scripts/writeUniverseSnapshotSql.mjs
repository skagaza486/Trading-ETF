import { readFileSync, writeFileSync } from 'node:fs'

function parseArgs(argv) {
  let snapshotMonth = null
  let effectiveDate = null
  let output = '/tmp/watchlist_universe_snapshot.sql'

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--month') {
      snapshotMonth = argv[index + 1] || snapshotMonth
      index += 1
      continue
    }
    if (arg === '--date') {
      effectiveDate = argv[index + 1] || effectiveDate
      index += 1
      continue
    }
    if (arg === '--out') {
      output = argv[index + 1] || output
      index += 1
      continue
    }
  }

  if (!snapshotMonth || !effectiveDate) {
    throw new Error('Usage: node scripts/writeUniverseSnapshotSql.mjs --month YYYY-MM --date YYYY-MM-DD [--out path]')
  }

  return { snapshotMonth, effectiveDate, output }
}

function parseWatchlistFromSource(source) {
  const objectMatches = source.match(/\{[^}]*ticker:\s*'[^']+'[^}]*\}/g) || []
  return objectMatches.map(item => {
    const ticker = item.match(/ticker:\s*'([^']+)'/)?.[1]
    const name = item.match(/name:\s*'([^']+)'/)?.[1] ?? item.match(/name:\s*"([^"]+)"/)?.[1]
    const sector = item.match(/sector:\s*'([^']+)'/)?.[1] ?? item.match(/sector:\s*"([^"]+)"/)?.[1]
    const tier = item.match(/tier:\s*(1|2)/)?.[1]
    if (!ticker || !name || !sector || !tier) {
      throw new Error(`Failed to parse watchlist row: ${item}`)
    }
    return { ticker, name, sector, tier: Number(tier) }
  })
}

function escapeSql(value) {
  return String(value).replaceAll("'", "''")
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const source = readFileSync('src/data/watchlist.ts', 'utf8')
  const rows = parseWatchlistFromSource(source)

  const sql = rows.map(row =>
    `INSERT OR REPLACE INTO watchlist_universe_snapshots (snapshot_month, effective_date, ticker, name, sector, tier, source, created_at) VALUES ('${escapeSql(options.snapshotMonth)}', '${escapeSql(options.effectiveDate)}', '${escapeSql(row.ticker)}', '${escapeSql(row.name)}', '${escapeSql(row.sector)}', ${row.tier}, 'repo_watchlist', datetime('now'));`
  ).join('\n')

  writeFileSync(options.output, sql)
  console.log(`Wrote ${rows.length} rows -> ${options.output}`)
}

main()
