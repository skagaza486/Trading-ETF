const DEFAULT_WORKER_URL = 'https://trading-etf.skagaza486.workers.dev'
const DEFAULT_BATCH_SIZE = 30
const DEFAULT_ETF_WEEKS = 52
const WATCHLIST_SIZE = 299

function parseArgs(argv) {
  let workerUrl = process.env.WORKER_URL || DEFAULT_WORKER_URL
  let ingestToken = process.env.INGEST_TOKEN
  let includeUniverse = true
  let includeSignals = true
  let includeEtf = false
  let batchSize = DEFAULT_BATCH_SIZE
  let etfWeeks = DEFAULT_ETF_WEEKS
  let universeFile = null

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
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
    if (arg === '--skip-universe') {
      includeUniverse = false
      continue
    }
    if (arg === '--skip-signals') {
      includeSignals = false
      continue
    }
    if (arg === '--include-etf') {
      includeEtf = true
      continue
    }
    if (arg === '--batch-size') {
      batchSize = Number(argv[index + 1] || batchSize)
      index += 1
      continue
    }
    if (arg === '--etf-weeks') {
      etfWeeks = Number(argv[index + 1] || etfWeeks)
      index += 1
      continue
    }
    if (arg === '--universe-file') {
      universeFile = argv[index + 1] || universeFile
      index += 1
      continue
    }
  }

  return { workerUrl: workerUrl.replace(/\/$/, ''), ingestToken, includeUniverse, includeSignals, includeEtf, batchSize, etfWeeks, universeFile }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let body
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { raw: text }
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }
  return body
}

async function runUniverseBackfill(options) {
  console.log('1/4 Universe snapshots: extracting git-backed month snapshots…')
  const { spawnSync } = await import('node:child_process')
  const args = ['scripts/backfillUniverseSnapshotsFromGit.mjs', '--apply', '--worker-url', options.workerUrl, '--token', options.ingestToken]
  if (options.universeFile) {
    args.push('--merge-file', options.universeFile)
  }
  const run = spawnSync('./.tools/node-v22.22.3-darwin-arm64/bin/node', args, {
    encoding: 'utf8'
  })
  if (run.stdout) process.stdout.write(run.stdout)
  if (run.stderr) process.stderr.write(run.stderr)
  if (run.status !== 0) {
    throw new Error(`Universe snapshot backfill failed with exit ${run.status}`)
  }
}

async function runSignalBackfill(options) {
  console.log('2/4 Signal backfill: replaying historical signals in chunks…')
  const offsets = []
  for (let offset = 0; offset < WATCHLIST_SIZE; offset += options.batchSize) {
    offsets.push(offset)
  }

  let totalRecords = 0
  for (const offset of offsets) {
    const url = new URL('/api/admin/backfill', options.workerUrl)
    url.searchParams.set('offset', String(offset))
    url.searchParams.set('batch_size', String(options.batchSize))
    const body = await requestJson(url, {
      headers: {
        Authorization: `Bearer ${options.ingestToken}`
      }
    })
    totalRecords += Number(body.records || 0)
    console.log(`offset=${offset} fetched=${body.fetched} records=${body.records}`)
  }

  console.log(`Signal backfill complete: chunks=${offsets.length} total_records=${totalRecords}`)
}

async function runEtfBackfill(options) {
  console.log('3/4 ETF backfill: rebuilding ETF replay rows…')
  const url = new URL('/api/admin/etf-backfill', options.workerUrl)
  url.searchParams.set('weeks', String(options.etfWeeks))
  const body = await requestJson(url, {
    headers: {
      Authorization: `Bearer ${options.ingestToken}`
    }
  })
  console.log(JSON.stringify(body))
}

async function runHealthCheck(options) {
  console.log('4/4 Research health: fetching summary metrics…')
  const body = await requestJson(new URL('/api/d1/research-health', options.workerUrl))
  console.log(JSON.stringify(body, null, 2))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.ingestToken) {
    throw new Error('INGEST_TOKEN is required')
  }

  if (options.includeUniverse) {
    await runUniverseBackfill(options)
  } else {
    console.log('1/4 Universe snapshots: skipped')
  }

  if (options.includeSignals) {
    await runSignalBackfill(options)
  } else {
    console.log('2/4 Signal backfill: skipped')
  }

  if (options.includeEtf) {
    await runEtfBackfill(options)
  } else {
    console.log('3/4 ETF backfill: skipped')
  }

  await runHealthCheck(options)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
