import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function parseArgs(argv) {
  let apply = false
  let workerUrl = (process.env.INGEST_URL || 'https://trading-etf.skagaza486.workers.dev/api/admin/ingest-snapshot')
    .replace(/\/api\/admin\/ingest-snapshot$/, '')
  let ingestToken = process.env.INGEST_TOKEN
  let mergeFile = null

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') {
      apply = true
      continue
    }
    if (arg === '--worker-url') {
      workerUrl = argv[index + 1] || workerUrl
      index += 1
      continue
    }
    if (arg === '--token') {
      ingestToken = argv[index + 1] || ingestToken
      index += 1
      continue
    }
    if (arg === '--merge-file') {
      mergeFile = argv[index + 1] || mergeFile
      index += 1
      continue
    }
  }

  return { apply, workerUrl, ingestToken, mergeFile }
}

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function listWatchlistCommits() {
  const raw = runGit(['log', '--follow', '--date=short', '--format=%H|%ad', '--', 'src/data/watchlist.ts'])
  if (!raw) return []
  return raw.split('\n').map(line => {
    const [hash, date] = line.split('|')
    return { hash, date }
  })
}

function parseLiteral(item, key) {
  const single = item.match(new RegExp(`${key}:\\s*'([^']+)'`))
  if (single?.[1]) return single[1]
  const double = item.match(new RegExp(`${key}:\\s*\"([^\"]+)\"`))
  return double?.[1] || null
}

function parseWatchlistFromSource(source) {
  const objectMatches = source.match(/\{[^}]*ticker:\s*'[^']+'[^}]*\}/g) || []
  return objectMatches.map(item => {
    const ticker = parseLiteral(item, 'ticker')
    const name = parseLiteral(item, 'name')
    const sector = parseLiteral(item, 'sector')
    const tierText = item.match(/tier:\s*(1|2)/)?.[1]
    if (!ticker || !name || !sector || !tierText) {
      throw new Error(`Failed to parse watchlist row: ${item}`)
    }
    return {
      ticker,
      name,
      sector,
      tier: Number(tierText),
    }
  })
}

function normalizeSnapshots(snapshots) {
  return [...snapshots]
    .map(snapshot => ({
      snapshotMonth: snapshot.snapshotMonth,
      effectiveDate: snapshot.effectiveDate,
      tickers: [...snapshot.tickers].sort((left, right) => left.ticker.localeCompare(right.ticker)),
    }))
    .sort((left, right) => left.snapshotMonth.localeCompare(right.snapshotMonth))
}

function loadManualSnapshots(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(raw)
  const snapshots = Array.isArray(parsed) ? parsed : parsed.snapshots
  if (!Array.isArray(snapshots)) {
    throw new Error(`Manual snapshot file must be an array or { snapshots: [...] }: ${filePath}`)
  }

  return snapshots.map(snapshot => {
    if (!snapshot || typeof snapshot.snapshotMonth !== 'string' || typeof snapshot.effectiveDate !== 'string' || !Array.isArray(snapshot.tickers)) {
      throw new Error(`Invalid manual snapshot entry in ${filePath}`)
    }

    const tickers = snapshot.tickers.map(stock => {
      if (!stock || typeof stock.ticker !== 'string' || typeof stock.name !== 'string' || typeof stock.sector !== 'string') {
        throw new Error(`Invalid ticker row in ${filePath} for month ${snapshot.snapshotMonth}`)
      }
      if (stock.tier !== 1 && stock.tier !== 2) {
        throw new Error(`Invalid tier in ${filePath} for ${stock.ticker} (${snapshot.snapshotMonth})`)
      }
      return {
        ticker: stock.ticker,
        name: stock.name,
        sector: stock.sector,
        tier: stock.tier,
      }
    })

    return {
      snapshotMonth: snapshot.snapshotMonth,
      effectiveDate: snapshot.effectiveDate,
      tickers,
    }
  })
}

function mergeSnapshots(baseSnapshots, overrideSnapshots) {
  const byMonth = new Map(baseSnapshots.map(snapshot => [snapshot.snapshotMonth, snapshot]))
  for (const snapshot of overrideSnapshots) {
    byMonth.set(snapshot.snapshotMonth, snapshot)
  }
  return normalizeSnapshots([...byMonth.values()])
}

function monthKey(date) {
  return date.slice(0, 7)
}

function compareMonths(left, right) {
  return left.localeCompare(right)
}

function incrementMonth(snapshotMonth) {
  const [yearText, monthText] = snapshotMonth.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const next = new Date(Date.UTC(year, month, 1))
  return next.toISOString().slice(0, 7)
}

function monthEndDate(snapshotMonth) {
  const [yearText, monthText] = snapshotMonth.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const end = new Date(Date.UTC(year, month, 0))
  return end.toISOString().slice(0, 10)
}

function cloneTickers(tickers) {
  return tickers.map(stock => ({ ...stock }))
}

function expandMonthlyCarryForward(snapshots) {
  if (snapshots.length <= 1) return snapshots

  const expanded = []
  for (let index = 0; index < snapshots.length; index += 1) {
    const current = snapshots[index]
    expanded.push({
      snapshotMonth: current.snapshotMonth,
      effectiveDate: current.effectiveDate,
      tickers: cloneTickers(current.tickers),
    })

    const next = snapshots[index + 1]
    if (!next) continue

    let fillMonth = incrementMonth(current.snapshotMonth)
    while (compareMonths(fillMonth, next.snapshotMonth) < 0) {
      expanded.push({
        snapshotMonth: fillMonth,
        effectiveDate: monthEndDate(fillMonth),
        tickers: cloneTickers(current.tickers),
      })
      fillMonth = incrementMonth(fillMonth)
    }
  }

  return normalizeSnapshots(expanded)
}

function buildSnapshotsFromGitHistory(commits) {
  const snapshotsByMonth = new Map()

  for (const commit of commits) {
    const snapshotMonth = monthKey(commit.date)
    if (snapshotsByMonth.has(snapshotMonth)) continue

    const source = runGit(['show', `${commit.hash}:src/data/watchlist.ts`])
    const tickers = parseWatchlistFromSource(source)
    snapshotsByMonth.set(snapshotMonth, {
      snapshotMonth,
      effectiveDate: commit.date,
      tickers,
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const currentMonth = monthKey(today)
  if (!snapshotsByMonth.has(currentMonth)) {
    const source = readFileSync('src/data/watchlist.ts', 'utf8')
    snapshotsByMonth.set(currentMonth, {
      snapshotMonth: currentMonth,
      effectiveDate: today,
      tickers: parseWatchlistFromSource(source),
    })
  }

  return normalizeSnapshots([...snapshotsByMonth.values()])
}

async function applySnapshots(workerUrl, ingestToken, snapshots) {
  const response = await fetch(`${workerUrl.replace(/\/$/, '')}/api/admin/universe-snapshots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ingestToken}`,
    },
    body: JSON.stringify({ snapshots }),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Universe snapshot ingest failed ${response.status}: ${text}`)
  }

  console.log(text)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const commits = listWatchlistCommits()
  let snapshots = buildSnapshotsFromGitHistory(commits)
  let manualSnapshotCount = 0

  if (options.mergeFile) {
    const manualSnapshots = normalizeSnapshots(loadManualSnapshots(options.mergeFile))
    manualSnapshotCount = manualSnapshots.length
    snapshots = mergeSnapshots(snapshots, manualSnapshots)
  }

  const sparseCount = snapshots.length
  snapshots = expandMonthlyCarryForward(snapshots)

  console.log(`Found ${commits.length} watchlist commits + ${manualSnapshotCount} manual snapshots -> ${sparseCount} sparse month snapshots -> ${snapshots.length} expanded month snapshots`)
  for (const snapshot of snapshots) {
    console.log(`${snapshot.snapshotMonth}  effective=${snapshot.effectiveDate}  tickers=${snapshot.tickers.length}`)
  }
  if (snapshots.length <= 1) {
    console.warn('Warning: git history only yields one snapshot month; older point-in-time universe months still need manual reconstruction/import.')
  }

  if (!options.apply) return
  if (!options.ingestToken) {
    throw new Error('INGEST_TOKEN is required when using --apply')
  }

  await applySnapshots(options.workerUrl, options.ingestToken, snapshots)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
