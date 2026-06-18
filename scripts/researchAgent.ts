import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stockWatchlist } from '../src/data/watchlist'
import { buildGateSummaryMarkdown, formatGateSummaryTable } from '../src/engine/gateSummaryMarkdown'
import { evaluateAllGates, evaluateRollingWindowRobustness } from '../src/engine/researchGate'
import type { LabelGateResult, LabelRobustnessResult } from '../src/engine/researchGate'
import { buildForwardReturnRecord, buildHistoricalSignals } from '../src/engine/stockResearchEngine'
import { fetchYahooTickerHistory } from '../src/services/marketData/yahooFinanceProvider'
import type { TickerHistory } from '../src/types/indicator'
import type { StockSignalLabel } from '../src/types/signal'

const STOCK_BENCHMARK_TICKERS = ['SPY', 'QQQ', 'IWM', '^VIX', 'GLD', '2800.HK']
const RESEARCH_SIGNAL_BARS = 250
const HISTORY_RANGE = '2y'
const FETCH_CONCURRENCY = 8
const SIGNAL_IMPROVEMENT_PATH = 'SIGNAL_IMPROVEMENT.md'
const CACHE_ROOT = path.join('.cache', 'research-agent')
const LATEST_ROOT = path.join(CACHE_ROOT, 'latest')
const HISTORY_ROOT = path.join(CACHE_ROOT, 'history')

type ResearchAgentMode = 'observe' | 'diagnose'
type ResearchExperimentId = 'EXP-009'

type FinnhubEarningsResponse = {
  earningsCalendar?: Array<{
    date?: string
    symbol?: string
  }>
}

type ResearchRunArtifacts = {
  runId: string
  syncedAt: string
  recordsCount: number
  failedTickers: string[]
  gateResults: LabelGateResult[]
  robustnessResults: LabelRobustnessResult[]
  gateSummaryMarkdown: string
  rollingRobustnessMarkdown: string
  diagnosisMarkdown: string
}

type ResearchExperiment = {
  id: ResearchExperimentId
  heading: string
  trackedLabels: StockSignalLabel[]
  baseline: {
    longSetupCount: number
    longSetupVsSpy: number
    longWatchVsSpy: number
    longPullbackVsSpy: number
  }
}

const EXPERIMENTS: Record<ResearchExperimentId, ResearchExperiment> = {
  'EXP-009': {
    id: 'EXP-009',
    heading: '### EXP-009 — LONG_BASE / WATCH / LONG_BOUNCE G3 驗證（signal 重新設計後）',
    trackedLabels: ['LONG_BASE', 'WATCH', 'LONG_BOUNCE'],
    baseline: {
      longSetupCount: 0,
      longSetupVsSpy: 0,
      longWatchVsSpy: 0,
      longPullbackVsSpy: 0
    }
  }
}

type AgentOptions = {
  mode: ResearchAgentMode
  experimentId: ResearchExperimentId
  syncDocs: boolean
}

const repoRoot = process.cwd()
const signalImprovementPath = path.join(repoRoot, SIGNAL_IMPROVEMENT_PATH)
const envLocalPath = path.join(repoRoot, '.env.local')

function parseArgs(argv: string[]): AgentOptions {
  let mode: ResearchAgentMode = 'observe'
  let experimentId: ResearchExperimentId = 'EXP-009'
  let syncDocs = true

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--mode') {
      const value = argv[index + 1]
      if (value === 'observe' || value === 'diagnose') {
        mode = value
        index += 1
        continue
      }
      throw new Error(`Unsupported mode: ${value ?? '(missing)'}`)
    }

    if (arg === '--exp') {
      const value = argv[index + 1]
      if (value === 'EXP-009') {
        experimentId = value
        index += 1
        continue
      }
      throw new Error(`Unsupported experiment: ${value ?? '(missing)'}`)
    }

    if (arg === '--no-sync-docs') {
      syncDocs = false
      continue
    }
  }

  if (mode === 'diagnose' && !argv.includes('--no-sync-docs')) {
    syncDocs = false
  }

  return { mode, experimentId, syncDocs }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

async function readEnvLocal(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(envLocalPath, 'utf8')
    return raw.split('\n').reduce<Record<string, string>>((env, line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return env

      const separator = trimmed.indexOf('=')
      if (separator === -1) return env

      const key = trimmed.slice(0, separator).trim()
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
      env[key] = value
      return env
    }, {})
  } catch {
    return {}
  }
}

function isoDateDaysAgo(daysAgo: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function formatSyncTimestamp(value: string): string {
  return new Date(value).toLocaleString('en-HK', { hour12: false })
}

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a'
  return `${(value * 100).toFixed(1)}%`
}

function formatSignedPercent(value: number | null): string {
  if (value === null) return 'n/a'
  const percent = value * 100
  const sign = percent > 0 ? '+' : ''
  return `${sign}${percent.toFixed(1)}%`
}

function toRunId(isoTimestamp: string): string {
  return isoTimestamp.replaceAll(':', '-').replaceAll('.', '-')
}

async function fetchHistoricalEarningsMapNode(symbols: string[], apiKey: string | undefined): Promise<Map<string, string[]>> {
  const uniqueSymbols = [...new Set(symbols)]
  const emptyMap = new Map(uniqueSymbols.map(symbol => [symbol, [] as string[]]))

  if (!apiKey) return emptyMap

  const fromDate = isoDateDaysAgo(365 * 2)
  const toDate = new Date().toISOString().slice(0, 10)

  const results = await mapWithConcurrency(uniqueSymbols, 4, async (symbol): Promise<readonly [string, string[]]> => {
    const url = new URL('https://finnhub.io/api/v1/calendar/earnings')
    url.searchParams.set('from', fromDate)
    url.searchParams.set('to', toDate)
    url.searchParams.set('symbol', symbol)
    url.searchParams.set('token', apiKey)

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      })

      if (!response.ok) {
        return [symbol, []]
      }

      const payload = await response.json() as FinnhubEarningsResponse
      const dates = (payload.earningsCalendar ?? [])
        .filter(entry => entry.symbol === symbol && typeof entry.date === 'string')
        .map(entry => entry.date as string)
        .sort()

      return [symbol, dates]
    } catch {
      return [symbol, []]
    }
  })

  return new Map(results)
}

async function fetchHistories(): Promise<{
  histories: Record<string, TickerHistory>
  failedTickers: string[]
}> {
  const tickers = [...new Set([...stockWatchlist.map(stock => stock.ticker), ...STOCK_BENCHMARK_TICKERS])]

  const results = await mapWithConcurrency(tickers, FETCH_CONCURRENCY, async ticker => {
    try {
      const history = await fetchYahooTickerHistory(ticker, { range: HISTORY_RANGE })
      return { ticker, history }
    } catch {
      return { ticker, history: null }
    }
  })

  const histories: Record<string, TickerHistory> = {}
  const failedTickers: string[] = []

  results.forEach(result => {
    if (result.history) {
      histories[result.ticker] = result.history
      return
    }

    failedTickers.push(result.ticker)
  })

  return { histories, failedTickers }
}

function formatWindowPass(passCount: number, totalWindows: number): string {
  if (totalWindows === 0) return 'n/a'
  return `${passCount}/${totalWindows}`
}

function buildRollingRobustnessMarkdown(robustnessResults: LabelRobustnessResult[], trackedLabels: StockSignalLabel[]): string {
  const rows = robustnessResults
    .filter(item => trackedLabels.includes(item.label))
    .flatMap(item => item.summaries.map(summary => [
      item.label,
      summary.window.label,
      formatWindowPass(summary.gate2PassWindows, summary.totalWindows),
      formatWindowPass(summary.gate3PassWindows, summary.totalWindows),
      formatWindowPass(summary.gate6PassWindows, summary.totalWindows),
      formatWindowPass(summary.fullPassWindows, summary.totalWindows),
      formatPercent(summary.avgRet5dVsSpy)
    ]))

  const lines = [
    '| Label | Window | G2 Pass | G3 Pass | G6 Pass | Full PASS | Avg 5D vs SPY |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |'
  ]

  rows.forEach(row => {
    lines.push(`| ${row.join(' | ')} |`)
  })

  return lines.join('\n')
}

function buildExp009Narrative(gateResults: LabelGateResult[], baseline: ResearchExperiment['baseline']): {
  conclusionLine: string
  nextStepLine: string
} {
  const longBase = gateResults.find(result => result.label === 'LONG_BASE')
  const watch = gateResults.find(result => result.label === 'WATCH')
  const longBounce = gateResults.find(result => result.label === 'LONG_BOUNCE')

  if (!longBase) {
    return {
      conclusionLine: '- 結論：AUTO-SYNC FAILED（缺少 LONG_BASE gate 結果；signal 已重新設計，需要重新建立 baseline）',
      nextStepLine: '- 下一步：執行 `research:agent -- --mode observe --exp EXP-009` 建立新設計的第一份 baseline'
    }
  }

  const baseG3Passed = longBase.gate3VsSpy === true
  const watchG3Passed = watch?.gate3VsSpy === true
  const bouncePositive = (longBounce?.avgRet5dVsSpy ?? Number.NEGATIVE_INFINITY) > 0

  let verdict = 'PARTIAL'
  if (baseG3Passed && watchG3Passed && bouncePositive) {
    verdict = 'PASS'
  } else if (!baseG3Passed && longBase.gate1SampleSize === false) {
    verdict = 'INSUFFICIENT'
  }

  const conclusionLine = [
    `- 結論：${verdict}（auto-sync）`,
    `LONG_BASE n=${longBase.count}, vs SPY ${formatSignedPercent(longBase.avgRet5dVsSpy)}`,
    baseG3Passed ? 'G3 PASS' : 'G3 FAIL',
    watch ? `WATCH vs SPY ${formatSignedPercent(watch.avgRet5dVsSpy)}` : 'WATCH n/a',
    longBounce ? `LONG_BOUNCE vs SPY ${formatSignedPercent(longBounce.avgRet5dVsSpy)}` : 'LONG_BOUNCE n/a'
  ].join('；')

  let nextStepLine = '- 下一步：新設計首次 baseline 已建立，繼續觀察後續同步結果'

  if (!baseG3Passed && longBase.gate1SampleSize) {
    nextStepLine = '- 下一步：LONG_BASE G3 未過；考慮收緊壓縮條件（atrSlope50 + rvolRecentAvg10 同時要求）'
  } else if (!watchG3Passed && watch) {
    nextStepLine = '- 下一步：WATCH 作 universe filter 不需過 G3；但若方向性持續負面，考慮加 RSI floor 或 ema20 > ema50 條件'
  } else if (!bouncePositive && longBounce) {
    nextStepLine = '- 下一步：LONG_BOUNCE 未轉正；確認 recentPullbackNearEma20 multi-bar 條件是否有效捕捉回調'
  }

  return { conclusionLine, nextStepLine }
}

function buildDiagnosisMarkdown(
  experiment: ResearchExperiment,
  gateResults: LabelGateResult[],
  robustnessResults: LabelRobustnessResult[],
  failedTickers: string[]
): string {
  const lines: string[] = [
    `# ${experiment.id} Diagnosis`,
    '',
    `Generated: ${formatSyncTimestamp(new Date().toISOString())}`,
    ''
  ]

  experiment.trackedLabels.forEach(label => {
    const gate = gateResults.find(item => item.label === label)
    const robustness = robustnessResults.find(item => item.label === label)

    lines.push(`## ${label}`)
    if (!gate) {
      lines.push('- Missing gate result; research dataset likely incomplete.')
      lines.push('')
      return
    }

    lines.push(`- Pooled status: ${gate.status}`)
    lines.push(`- Sample size: ${gate.count}`)
    lines.push(`- Avg 5D: ${formatPercent(gate.avgRet5d)}`)
    lines.push(`- Avg 5D vs SPY: ${formatPercent(gate.avgRet5dVsSpy)}`)
    lines.push(`- MAE 5D: ${formatPercent(gate.avgMae5d)}`)

    if (gate.count < 100) {
      lines.push('- Issue: G1 sample-size floor is not met; do not over-interpret direction or MAE.')
    }
    if (gate.gate3VsSpy === false) {
      lines.push('- Issue: G3 vs-SPY gate is still failing; current filter is not selective enough.')
    }
    if (gate.gate6Mae === false) {
      lines.push('- Issue: G6 MAE control is failing; entries are still too loose or too early.')
    }
    if (gate.gate4Consistent === false) {
      lines.push('- Issue: G4 half-split consistency is failing; pooled edge may not be stable across time.')
    }

    if (robustness) {
      const g3PassWindows = robustness.summaries.reduce((sum, summary) => sum + summary.gate3PassWindows, 0)
      const totalWindows = robustness.summaries.reduce((sum, summary) => sum + summary.totalWindows, 0)
      lines.push(`- Rolling note: G3 passed in ${g3PassWindows}/${totalWindows} tracked windows.`)

      if (g3PassWindows === 0) {
        lines.push('- Robustness risk: no rolling window is passing G3; avoid promoting this rule to a stronger production weight.')
      }
    }

    if (label === 'LONG_BASE' && gate.gate3VsSpy === false) {
      lines.push('- Suggested knob: require both atrSlope50 < 0 AND rvolRecentAvg10 < 0.8 (currently OR); tighten to ensure real compression.')
    }
    if (label === 'LONG_BOUNCE' && (gate.avgRet5dVsSpy ?? Number.NEGATIVE_INFINITY) <= 0) {
      lines.push('- Suggested knob: verify recentPullbackNearEma20 multi-bar logic; may need tighter CLV floor or RSI range.')
    }

    lines.push('')
  })

  lines.push('## Run Health')
  lines.push(`- Failed tickers: ${failedTickers.length === 0 ? 'none' : failedTickers.join(', ')}`)
  lines.push('- Agent action scope: observe/diagnose only in v1; code-edit mode intentionally not enabled yet.')

  return lines.join('\n')
}

function updateExp009Section(
  content: string,
  syncedBlock: string,
  robustnessBlock: string,
  conclusionLine: string,
  nextStepLine: string
): string {
  const experiment = EXPERIMENTS['EXP-009']
  const sectionStart = content.indexOf(experiment.heading)
  if (sectionStart === -1) {
    throw new Error('EXP-009 section not found in SIGNAL_IMPROVEMENT.md')
  }

  const sectionEnd = content.indexOf('\n---', sectionStart)
  const safeSectionEnd = sectionEnd === -1 ? content.length : sectionEnd
  const section = content.slice(sectionStart, safeSectionEnd)

  const summaryInjected = section.replace(
    /- 改動後 Gate Summary[\s\S]*?(?=\n- 預期：)/,
    `${syncedBlock}\n\n${robustnessBlock}\n`
  )

  if (summaryInjected === section) {
    throw new Error('Unable to replace EXP-009 Gate Summary block')
  }

  const conclusionInjected = summaryInjected.replace(/- 結論：[^\n]*/, conclusionLine)
  const nextStepInjected = conclusionInjected.replace(/- 下一步：[^\n]*/, nextStepLine)

  return `${content.slice(0, sectionStart)}${nextStepInjected}${content.slice(safeSectionEnd)}`
}

async function writeArtifacts(artifacts: ResearchRunArtifacts) {
  const latestRunRoot = path.join(repoRoot, LATEST_ROOT)
  const historyRunRoot = path.join(repoRoot, HISTORY_ROOT, artifacts.runId)

  await mkdir(latestRunRoot, { recursive: true })
  await mkdir(historyRunRoot, { recursive: true })

  const payload = {
    runId: artifacts.runId,
    syncedAt: artifacts.syncedAt,
    recordsCount: artifacts.recordsCount,
    failedTickers: artifacts.failedTickers,
    gateResults: artifacts.gateResults,
    robustnessResults: artifacts.robustnessResults
  }

  const files: Array<[string, string]> = [
    ['gate-summary.md', artifacts.gateSummaryMarkdown],
    ['rolling-robustness.md', artifacts.rollingRobustnessMarkdown],
    ['diagnosis.md', artifacts.diagnosisMarkdown],
    ['research-report.json', JSON.stringify(payload, null, 2)]
  ]

  for (const [fileName, content] of files) {
    await writeFile(path.join(latestRunRoot, fileName), content, 'utf8')
    await writeFile(path.join(historyRunRoot, fileName), content, 'utf8')
  }
}

async function runAgent(options: AgentOptions) {
  const experiment = EXPERIMENTS[options.experimentId]
  const envLocal = await readEnvLocal()
  const finnhubApiKey = process.env.FINNHUB_API_KEY ?? envLocal.FINNHUB_API_KEY

  const { histories, failedTickers } = await fetchHistories()
  const historicalEarnings = await fetchHistoricalEarningsMapNode(
    stockWatchlist.map(stock => stock.ticker),
    finnhubApiKey
  )
  const signals = buildHistoricalSignals(
    histories,
    stockWatchlist.map(stock => stock.ticker),
    RESEARCH_SIGNAL_BARS,
    historicalEarnings
  )
  const records = buildForwardReturnRecord(signals, histories)
  const gateResults = evaluateAllGates(records)
  const robustnessResults = evaluateRollingWindowRobustness(records)

  if (gateResults.length === 0) {
    throw new Error('No gate results generated; agent aborted.')
  }

  const syncedAt = new Date().toISOString()
  const runId = toRunId(syncedAt)
  const gateSummaryMarkdown = buildGateSummaryMarkdown(gateResults, syncedAt)
  const rollingRobustnessMarkdown = [
    `# Rolling Robustness`,
    '',
    `Generated: ${formatSyncTimestamp(syncedAt)}`,
    '',
    buildRollingRobustnessMarkdown(robustnessResults, experiment.trackedLabels)
  ].join('\n')
  const diagnosisMarkdown = buildDiagnosisMarkdown(experiment, gateResults, robustnessResults, failedTickers)

  const artifacts: ResearchRunArtifacts = {
    runId,
    syncedAt,
    recordsCount: records.length,
    failedTickers,
    gateResults,
    robustnessResults,
    gateSummaryMarkdown,
    rollingRobustnessMarkdown,
    diagnosisMarkdown
  }

  await writeArtifacts(artifacts)

  if (options.syncDocs && options.experimentId === 'EXP-009') {
    const syncedBlock = [
      `- 改動後 Gate Summary（auto-sync ${formatSyncTimestamp(syncedAt)}）:`,
      '',
      formatGateSummaryTable(gateResults)
    ].join('\n')
    const robustnessBlock = [
      `- Rolling Robustness（auto-sync ${formatSyncTimestamp(syncedAt)}）:`,
      '',
      buildRollingRobustnessMarkdown(robustnessResults, experiment.trackedLabels)
    ].join('\n')
    const { conclusionLine, nextStepLine } = buildExp009Narrative(gateResults, experiment.baseline)
    const currentContent = await readFile(signalImprovementPath, 'utf8')
    const nextContent = updateExp009Section(currentContent, syncedBlock, robustnessBlock, conclusionLine, nextStepLine)
    await writeFile(signalImprovementPath, nextContent, 'utf8')
  }

  const longBase = gateResults.find(result => result.label === 'LONG_BASE')

  console.log(`Research Agent run complete: ${options.experimentId} [${options.mode}]`)
  console.log(`Run ID: ${runId}`)
  console.log(`Records: ${records.length} | Labels: ${gateResults.length} | Failed tickers: ${failedTickers.length}`)
  console.log(`Artifacts: ${path.join(LATEST_ROOT)}`)
  if (longBase) {
    console.log(
      `LONG_BASE => n=${longBase.count}, avg5D=${formatPercent(longBase.avgRet5d)}, vsSPY=${formatPercent(longBase.avgRet5dVsSpy)}, status=${longBase.status}`
    )
  }

  if (options.mode === 'diagnose') {
    console.log('')
    console.log(diagnosisMarkdown)
  }
}

void runAgent(parseArgs(process.argv.slice(2))).catch(error => {
  console.error(error instanceof Error ? error.message : 'Research agent failed.')
  process.exitCode = 1
})
