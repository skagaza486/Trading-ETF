import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stockWatchlist } from '../src/data/watchlist'
import { buildGateSummaryMarkdown, formatGateSummaryTable } from '../src/engine/gateSummaryMarkdown'
import { evaluateAllGates, evaluateRollingWindowRobustness } from '../src/engine/researchGate'
import { buildForwardReturnRecord, buildHistoricalSignals } from '../src/engine/stockResearchEngine'
import { fetchYahooTickerHistory } from '../src/services/marketData/yahooFinanceProvider'
import type { TickerHistory } from '../src/types/indicator'

const STOCK_BENCHMARK_TICKERS = ['SPY', 'QQQ', 'IWM', '^VIX', 'GLD', '2800.HK']
const EXP009_HEADING = '### EXP-009 — LONG_SETUP / LONG_WATCH / LONG_PULLBACK G3 修復（RS 過濾）'
const RESEARCH_SIGNAL_BARS = 180
const HISTORY_RANGE = '2y'
const FETCH_CONCURRENCY = 8
const EXP009_BASELINE = {
  longSetupCount: 922,
  longSetupVsSpy: 0.002,
  longWatchVsSpy: 0.004,
  longPullbackVsSpy: -0.003
}

const repoRoot = process.cwd()
const signalImprovementPath = path.join(repoRoot, 'SIGNAL_IMPROVEMENT.md')
const envLocalPath = path.join(repoRoot, '.env.local')

type FinnhubEarningsResponse = {
  earningsCalendar?: Array<{
    date?: string
    symbol?: string
  }>
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
    return raw.split('\n').reduce<Record<string, string>>((env: Record<string, string>, line: string) => {
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

async function fetchHistoricalEarningsMapNode(symbols: string[], apiKey: string | undefined): Promise<Map<string, string[]>> {
  const uniqueSymbols = [...new Set(symbols)]
  const emptyMap = new Map(uniqueSymbols.map(symbol => [symbol, [] as string[]]))

  if (!apiKey) {
    return emptyMap
  }

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
      return { ticker, history, error: null }
    } catch (error) {
      return {
        ticker,
        history: null,
        error: error instanceof Error ? error.message : 'Unknown fetch error'
      }
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

function updateExp009Section(
  content: string,
  syncedBlock: string,
  robustnessBlock: string,
  conclusionLine: string,
  nextStepLine: string
): string {
  const sectionStart = content.indexOf(EXP009_HEADING)
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

function formatSignedPercent(value: number | null): string {
  if (value === null) return 'n/a'
  const percent = value * 100
  const sign = percent > 0 ? '+' : ''
  return `${sign}${percent.toFixed(1)}%`
}

function buildExp009Narrative(gateResults: ReturnType<typeof evaluateAllGates>): {
  conclusionLine: string
  nextStepLine: string
} {
  const longSetup = gateResults.find(result => result.label === 'LONG_SETUP')
  const longWatch = gateResults.find(result => result.label === 'LONG_WATCH')
  const longPullback = gateResults.find(result => result.label === 'LONG_PULLBACK')

  if (!longSetup || !longWatch || !longPullback) {
    return {
      conclusionLine: '- 結論：AUTO-SYNC FAILED（缺少 LONG_SETUP / LONG_WATCH / LONG_PULLBACK gate 結果）',
      nextStepLine: '- 下一步：檢查 research dataset 是否完整生成，確認相關 label 沒有被條件改動意外消失'
    }
  }

  const setupSampleReduced = longSetup.count < EXP009_BASELINE.longSetupCount
  const setupVsSpyImproved = (longSetup.avgRet5dVsSpy ?? Number.NEGATIVE_INFINITY) > EXP009_BASELINE.longSetupVsSpy
  const setupG3Passed = longSetup.gate3VsSpy === true
  const watchG3Passed = longWatch.gate3VsSpy === true
  const pullbackTurnedPositive = (longPullback.avgRet5dVsSpy ?? Number.NEGATIVE_INFINITY) > 0

  let verdict = 'PARTIAL'
  if (setupG3Passed && watchG3Passed && pullbackTurnedPositive) {
    verdict = 'PASS'
  } else if (!setupSampleReduced && !setupVsSpyImproved) {
    verdict = 'FAIL'
  }

  const conclusionLine = [
    `- 結論：${verdict}（auto-sync）`,
    `LONG_SETUP 樣本由 ${EXP009_BASELINE.longSetupCount} 降至 ${longSetup.count}`,
    `vs SPY 由 ${formatSignedPercent(EXP009_BASELINE.longSetupVsSpy)} 升至 ${formatSignedPercent(longSetup.avgRet5dVsSpy)}`,
    setupG3Passed ? '已通過 G3' : '仍未過 G3 > +0.5%',
    `LONG_WATCH vs SPY ${formatSignedPercent(longWatch.avgRet5dVsSpy)}`,
    `LONG_PULLBACK vs SPY ${formatSignedPercent(longPullback.avgRet5dVsSpy)}`
  ].join('；')

  let nextStepLine = '- 下一步：保留當前 RS 過濾，繼續觀察下一輪自動同步結果'

  if (!setupG3Passed) {
    nextStepLine = '- 下一步：按 ROADMAP 建議，把 LONG_SETUP 的 RVOL 門檻由 1.2 提高到 1.5，然後重新執行 `research:sync-exp009`'
  } else if (!watchG3Passed) {
    nextStepLine = '- 下一步：LONG_SETUP 已改善，但 LONG_WATCH 仍未過 G3；可考慮再收緊 LONG_WATCH 的 RS 或動量門檻，之後重新同步'
  } else if (!pullbackTurnedPositive) {
    nextStepLine = '- 下一步：LONG_PULLBACK 仍未轉正，建議把它獨立成下一個假設，不要和 LONG_SETUP 共用同一輪結論'
  }

  return { conclusionLine, nextStepLine }
}

function formatRollingRobustnessTable(
  robustnessResults: ReturnType<typeof evaluateRollingWindowRobustness>
): string {
  const rows = robustnessResults
    .filter(item => item.label === 'LONG_SETUP' || item.label === 'LONG_WATCH' || item.label === 'LONG_PULLBACK')
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

function formatWindowPass(passCount: number, totalWindows: number): string {
  if (totalWindows === 0) return 'n/a'
  return `${passCount}/${totalWindows}`
}

async function main() {
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
    throw new Error('No gate results generated; aborting sync.')
  }

  const syncedAt = new Date().toISOString()
  const syncedBlock = [
    `- 改動後 Gate Summary（auto-sync ${formatSyncTimestamp(syncedAt)}）:`,
    '',
    formatGateSummaryTable(gateResults)
  ].join('\n')
  const robustnessBlock = [
    `- Rolling Robustness（auto-sync ${formatSyncTimestamp(syncedAt)}）:`,
    '',
    formatRollingRobustnessTable(robustnessResults)
  ].join('\n')
  const { conclusionLine, nextStepLine } = buildExp009Narrative(gateResults)

  const currentContent = await readFile(signalImprovementPath, 'utf8')
  const nextContent = updateExp009Section(currentContent, syncedBlock, robustnessBlock, conclusionLine, nextStepLine)
  await writeFile(signalImprovementPath, nextContent, 'utf8')

  const longSetup = gateResults.find(result => result.label === 'LONG_SETUP')

  console.log(`Synced EXP-009 Gate Summary at ${formatSyncTimestamp(syncedAt)}`)
  console.log(`Records: ${records.length} | Labels: ${gateResults.length} | Failures: ${failedTickers.length}`)
  if (failedTickers.length > 0) {
    console.log(`Failed tickers: ${failedTickers.slice(0, 12).join(', ')}`)
  }
  if (longSetup) {
    console.log(
      `LONG_SETUP => n=${longSetup.count}, avg5D=${formatPercent(longSetup.avgRet5d)}, vsSPY=${formatPercent(longSetup.avgRet5dVsSpy)}, status=${longSetup.status}`
    )
  }
  console.log(conclusionLine)
  console.log(nextStepLine)
  console.log('')
  console.log(robustnessBlock)

  console.log('')
  console.log(buildGateSummaryMarkdown(gateResults, syncedAt))
}

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a'
  return `${(value * 100).toFixed(1)}%`
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Signal improvement sync failed.')
  process.exitCode = 1
})
