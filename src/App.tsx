import { useEffect, useState } from 'react'
import { etfUniverse } from './data/etfUniverse'
import { stockWatchlist } from './data/watchlist'
import { replayETF } from './engine/etfReplayEngine'
import { classifyETF } from './engine/etfWeeklyEngine'
import { classifyRegime, deriveRegimeInputsFromHistories } from './engine/marketRegime'
import { buildForwardReturnRecord, buildHistoricalSignals } from './engine/stockResearchEngine'
import { evaluateAllGates } from './engine/researchGate'
import type { LabelGateResult } from './engine/researchGate'
import { classifyStock } from './engine/stockScreenerEngine'
import { fetchEarningsCalendar, fetchHistoricalEarningsMap } from './services/marketData/earningsProvider'
import { fetchYahooTickerHistory } from './services/marketData/yahooFinanceProvider'
import type { TickerHistory } from './types/indicator'
import type { ETFReplayWeek } from './types/replay'
import type { ForwardReturnRecord } from './types/research'
import type { ETFRecommendation, RegimeClass, StockSignalLabel } from './types/signal'
import { getETFLabelDisplay, getRegimeBanner, getStockLabelDisplay } from './ui/labelDisplay'
import './styles/dashboard.css'
import './styles/global.css'

type TabId = 'ETF Weekly' | 'ETF Replay' | 'Stock Screener' | 'Stock Replay' | 'Stock Research'

type WeeklyRow = {
  ticker: string
  name: string
  label: ETFRecommendation['label']
  return13w: number | null
  priceVs40wMa: number | null
  reason: string
}

type WeeklyState = {
  rows: WeeklyRow[]
  replayRows: ReplayRow[]
  histories: Record<string, TickerHistory>
  failedTickers: string[]
  regime: RegimeClass
  lastUpdated: string | null
}

type ReplayRow = ETFReplayWeek & {
  name: string
}

type ReplayAnalytics = {
  favourBeatSpy1wRate: number | null
  favourBeatSpy4wRate: number | null
  favourExcess1w: number | null
  favourExcess4w: number | null
  favourVsAvoidWeeks1w: number
  favourVsAvoidWins1w: number
  favourVsAvoidWeeks4w: number
  favourVsAvoidWins4w: number
}

type StockRow = {
  ticker: string
  name: string
  sector: string
  label: StockSignalLabel
  regime: RegimeClass
  earningsDate: string | null
  rsi14: number | null
  rvol: number | null
  relStrengthVsSpy: number | null
  reason: string
}

type StockState = {
  histories: Record<string, TickerHistory>
  rows: StockRow[]
  failedTickers: string[]
  lastUpdated: string | null
  earningsConfigured: boolean
  regime: RegimeClass
}

type ResearchState = {
  records: ForwardReturnRecord[]
  lastUpdated: string | null
}

type HeroMetric = {
  label: string
  value: string
  note: string
  tone: 'gain' | 'info' | 'warn' | 'violet'
}

type SummaryTone = 'gain' | 'info' | 'warn' | 'loss' | 'violet'

const tabs: TabId[] = ['ETF Weekly', 'ETF Replay', 'Stock Screener', 'Stock Replay', 'Stock Research']
const BENCHMARK_TICKERS = ['SPY', 'QQQ', '^VIX']
const STOCK_BENCHMARK_TICKERS = ['SPY', 'QQQ', 'IWM', '^VIX', 'GLD', '2800.HK']
const REPLAY_WEEKS = 26

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a'
  return `${(value * 100).toFixed(1)}%`
}

function formatRatio(value: number | null): string {
  if (value === null) return 'n/a'
  return value.toFixed(2)
}

function etfLabelPriority(label: ETFRecommendation['label']): number {
  switch (label) {
    case 'FAVOUR': return 0
    case 'WATCH': return 1
    case 'WAIT': return 2
    case 'AVOID': return 3
    case 'REVIEW': return 4
  }
}

function buildWeeklyRows(histories: Record<string, TickerHistory>, regime: RegimeClass): WeeklyRow[] {
  return etfUniverse
    .map(etf => {
      const history = histories[etf.ticker]

      if (!history) {
        return {
          ticker: etf.ticker,
          name: etf.name,
          label: 'REVIEW' as const,
          return13w: null,
          priceVs40wMa: null,
          reason: 'History fetch failed.'
        }
      }

      const recommendation = classifyETF(history, histories, regime)

      return {
        ticker: etf.ticker,
        name: etf.name,
        label: recommendation.label,
        return13w: recommendation.indicators.return13w,
        priceVs40wMa: recommendation.indicators.priceVs40wMa,
        reason: recommendation.reason
      }
    })
    .sort((left, right) => {
      const pDiff = etfLabelPriority(left.label) - etfLabelPriority(right.label)
      if (pDiff !== 0) return pDiff
      const rDiff = (right.return13w ?? Number.NEGATIVE_INFINITY) - (left.return13w ?? Number.NEGATIVE_INFINITY)
      if (rDiff !== 0) return rDiff
      return left.ticker.localeCompare(right.ticker)
    })
}

function buildReplayRows(histories: Record<string, TickerHistory>): ReplayRow[] {
  return etfUniverse
    .flatMap(etf => {
      const history = histories[etf.ticker]
      if (!history) return []

      return replayETF(history, histories, REPLAY_WEEKS).map(week => ({
        ...week,
        name: etf.name
      }))
    })
    .sort((left, right) => {
      if (left.weekEndingDate !== right.weekEndingDate) {
        return right.weekEndingDate.localeCompare(left.weekEndingDate)
      }

      return left.ticker.localeCompare(right.ticker)
    })
}

function labelCounts(rows: WeeklyRow[]): Record<ETFRecommendation['label'], number> {
  return rows.reduce(
    (counts, row) => {
      counts[row.label] += 1
      return counts
    },
    { FAVOUR: 0, WATCH: 0, WAIT: 0, AVOID: 0, REVIEW: 0 }
  )
}

function regimeSummary(regime: RegimeClass): string {
  if (regime === 'long_friendly') return 'Long-friendly'
  if (regime === 'short_friendly') return 'Short-friendly'
  return 'Neutral'
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildReplaySummary(rows: ReplayRow[]): Array<{
  label: ETFRecommendation['label']
  count: number
  avgRet1w: number | null
  avgRet4w: number | null
}> {
  const labels: ETFRecommendation['label'][] = ['FAVOUR', 'WATCH', 'WAIT', 'AVOID', 'REVIEW']

  return labels.map(label => {
    const matchingRows = rows.filter(row => row.label === label)

    return {
      label,
      count: matchingRows.length,
      avgRet1w: average(matchingRows.flatMap(row => (row.ret1w === null ? [] : [row.ret1w]))),
      avgRet4w: average(matchingRows.flatMap(row => (row.ret4w === null ? [] : [row.ret4w])))
    }
  })
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return numerator / denominator
}

function summaryToneClass(tone: SummaryTone): string {
  return `summary-card summary-card--${tone}`
}

function etfLabelTone(label: ETFRecommendation['label']): SummaryTone {
  switch (label) {
    case 'FAVOUR': return 'gain'
    case 'WATCH': return 'warn'
    case 'WAIT': return 'info'
    case 'AVOID': return 'loss'
    case 'REVIEW': return 'violet'
  }
}

function numericMetricText(value: number, decimals: number, suffix = ''): string {
  return `${value.toFixed(decimals)}${suffix}`
}

function parseAnimatedMetric(value: string): { target: number; decimals: number; suffix: string } | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(%)?$/)
  if (!match) return null

  const target = Number(match[1])
  if (Number.isNaN(target)) return null

  return {
    target,
    decimals: match[1].includes('.') ? match[1].split('.')[1].length : 0,
    suffix: match[2] ?? ''
  }
}

function AnimatedMetricValue({ value, className }: { value: string; className?: string }) {
  const parsed = parseAnimatedMetric(value)
  const [displayValue, setDisplayValue] = useState(() => {
    if (!parsed) return value
    return numericMetricText(0, parsed.decimals, parsed.suffix)
  })

  useEffect(() => {
    if (!parsed) {
      setDisplayValue(value)
      return
    }

    const duration = 720
    const start = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - progress) * (1 - progress)
      const current = parsed.target * eased
      setDisplayValue(numericMetricText(current, parsed.decimals, parsed.suffix))

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick)
      }
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [parsed?.target, parsed?.decimals, parsed?.suffix, value])

  return <span className={className}>{parsed ? displayValue : value}</span>
}

function buildSparklinePath(history: TickerHistory | undefined): { line: string; area: string } | null {
  if (!history) return null

  const closes = history.bars.slice(-24).map(bar => bar.close).filter(close => Number.isFinite(close))
  if (closes.length < 2) return null

  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const width = 120
  const height = 36
  const range = max - min || 1

  const points = closes.map((close, index) => {
    const x = (index / (closes.length - 1)) * width
    const y = height - ((close - min) / range) * height
    return { x, y }
  })

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  const area = `${line} L ${last.x.toFixed(2)} ${height} L ${first.x.toFixed(2)} ${height} Z`

  return { line, area }
}

function StockSparkline({ history, group }: { history: TickerHistory | undefined; group: string }) {
  const sparkline = buildSparklinePath(history)
  if (!sparkline) return null

  return (
    <div className={`stock-card__sparkline stock-card__sparkline--${group}`} aria-hidden="true">
      <svg viewBox="0 0 120 36" preserveAspectRatio="none">
        <path className="stock-card__sparkline-area" d={sparkline.area} />
        <path className="stock-card__sparkline-line" d={sparkline.line} />
      </svg>
    </div>
  )
}

function buildReplayAnalytics(rows: ReplayRow[], spyRows: ETFReplayWeek[]): ReplayAnalytics {
  const spyByWeek = new Map(
    spyRows.map(row => [
      row.weekEndingDate,
      {
        ret1w: row.ret1w,
        ret4w: row.ret4w
      }
    ])
  )
  const favourRows = rows.filter(row => row.label === 'FAVOUR')
  const favourExcess1wSeries = favourRows.flatMap(row => {
    const spy = spyByWeek.get(row.weekEndingDate)
    return row.ret1w != null && spy?.ret1w != null ? [row.ret1w - spy.ret1w] : []
  })
  const favourExcess4wSeries = favourRows.flatMap(row => {
    const spy = spyByWeek.get(row.weekEndingDate)
    return row.ret4w != null && spy?.ret4w != null ? [row.ret4w - spy.ret4w] : []
  })
  const favourBeatSpy1wWins = favourRows.filter(row => {
    const spy = spyByWeek.get(row.weekEndingDate)
    return row.ret1w != null && spy?.ret1w != null && row.ret1w > spy.ret1w
  }).length
  const favourBeatSpy4wWins = favourRows.filter(row => {
    const spy = spyByWeek.get(row.weekEndingDate)
    return row.ret4w != null && spy?.ret4w != null && row.ret4w > spy.ret4w
  }).length
  const weeks = [...new Set(rows.map(row => row.weekEndingDate))]
  let favourVsAvoidWeeks1w = 0
  let favourVsAvoidWins1w = 0
  let favourVsAvoidWeeks4w = 0
  let favourVsAvoidWins4w = 0

  weeks.forEach(weekEndingDate => {
    const favourWeekRows = rows.filter(row => row.weekEndingDate === weekEndingDate && row.label === 'FAVOUR')
    const avoidWeekRows = rows.filter(row => row.weekEndingDate === weekEndingDate && row.label === 'AVOID')
    const favour1w = average(favourWeekRows.flatMap(row => (row.ret1w === null ? [] : [row.ret1w])))
    const avoid1w = average(avoidWeekRows.flatMap(row => (row.ret1w === null ? [] : [row.ret1w])))
    const favour4w = average(favourWeekRows.flatMap(row => (row.ret4w === null ? [] : [row.ret4w])))
    const avoid4w = average(avoidWeekRows.flatMap(row => (row.ret4w === null ? [] : [row.ret4w])))

    if (favour1w !== null && avoid1w !== null) {
      favourVsAvoidWeeks1w += 1
      if (favour1w > avoid1w) {
        favourVsAvoidWins1w += 1
      }
    }

    if (favour4w !== null && avoid4w !== null) {
      favourVsAvoidWeeks4w += 1
      if (favour4w > avoid4w) {
        favourVsAvoidWins4w += 1
      }
    }
  })

  return {
    favourBeatSpy1wRate: rate(favourBeatSpy1wWins, favourExcess1wSeries.length),
    favourBeatSpy4wRate: rate(favourBeatSpy4wWins, favourExcess4wSeries.length),
    favourExcess1w: average(favourExcess1wSeries),
    favourExcess4w: average(favourExcess4wSeries),
    favourVsAvoidWeeks1w,
    favourVsAvoidWins1w,
    favourVsAvoidWeeks4w,
    favourVsAvoidWins4w
  }
}

function buildStockRows(
  histories: Record<string, TickerHistory>,
  regime: RegimeClass,
  earningsDates: Map<string, string | null>
): StockRow[] {
  const stockPriority = (label: StockSignalLabel): number => {
    switch (label) {
      case 'UP_PROMOTION': return 0
      case 'LONG_CONFIRM': return 1
      case 'LONG_SETUP': return 2
      case 'LONG_WATCH': return 3
      case 'DOWN_PROMOTION': return 4
      case 'SHORT_CONFIRM': return 5
      case 'SHORT_SETUP': return 6
      case 'SHORT_WATCH': return 7
      case 'NEUTRAL': return 8
      case 'AVOID_CHOP': return 9
      case 'REVIEW_EVENT': return 10
      case 'REVIEW_DATA': return 11
    }
  }

  return stockWatchlist
    .map(stock => {
      const history = histories[stock.ticker]
      const earningsDate = earningsDates.get(stock.ticker) ?? null

      if (!history) {
        return {
          ticker: stock.ticker,
          name: stock.name,
          sector: stock.sector,
          label: 'REVIEW_DATA' as const,
          regime,
          earningsDate,
          rsi14: null,
          rvol: null,
          relStrengthVsSpy: null,
          reason: 'History fetch failed.'
        }
      }

      const signal = classifyStock(history, histories, earningsDate, regime)

      return {
        ticker: stock.ticker,
        name: stock.name,
        sector: stock.sector,
        label: signal.label,
        regime: signal.regime,
        earningsDate,
        rsi14: signal.indicators.rsi14,
        rvol: signal.indicators.rvol,
        relStrengthVsSpy: signal.indicators.relStrengthVsSpy,
        reason: signal.reason
      }
    })
    .sort((left, right) => {
      const priorityDiff = stockPriority(left.label) - stockPriority(right.label)
      if (priorityDiff !== 0) return priorityDiff

      const rsDiff = (right.relStrengthVsSpy ?? Number.NEGATIVE_INFINITY) - (left.relStrengthVsSpy ?? Number.NEGATIVE_INFINITY)
      if (rsDiff !== 0) return rsDiff

      return left.ticker.localeCompare(right.ticker)
    })
}

function stockLabelGroup(label: StockSignalLabel): 'LONG' | 'SHORT' | 'NEUTRAL' | 'REVIEW' {
  if (label.startsWith('LONG') || label === 'UP_PROMOTION') return 'LONG'
  if (label.startsWith('SHORT') || label === 'DOWN_PROMOTION') return 'SHORT'
  if (label === 'REVIEW_DATA' || label === 'REVIEW_EVENT') return 'REVIEW'
  return 'NEUTRAL'
}

function countStockGroups(rows: StockRow[]): Record<'LONG' | 'SHORT' | 'NEUTRAL' | 'REVIEW', number> {
  return rows.reduce(
    (counts, row) => {
      counts[stockLabelGroup(row.label)] += 1
      return counts
    },
    { LONG: 0, SHORT: 0, NEUTRAL: 0, REVIEW: 0 }
  )
}

function stockResearchLabelPriority(label: StockSignalLabel): number {
  switch (label) {
    case 'UP_PROMOTION': return 0
    case 'LONG_CONFIRM': return 1
    case 'LONG_SETUP': return 2
    case 'LONG_WATCH': return 3
    case 'DOWN_PROMOTION': return 4
    case 'SHORT_CONFIRM': return 5
    case 'SHORT_SETUP': return 6
    case 'SHORT_WATCH': return 7
    case 'NEUTRAL': return 8
    case 'AVOID_CHOP': return 9
    case 'REVIEW_EVENT': return 10
    case 'REVIEW_DATA': return 11
  }
}

function gateIcon(result: boolean | null): string {
  if (result === true) return '✓'
  if (result === false) return '✗'
  return '—'
}

function gateClass(result: boolean | null): string {
  if (result === true) return 'gate-pass'
  if (result === false) return 'gate-fail'
  return 'gate-na'
}

function countDirectionalResearch(records: ForwardReturnRecord[]): {
  longCount: number
  shortCount: number
  excess5dLong: number | null
  excess5dShort: number | null
} {
  const longRecords = records.filter(record => stockLabelGroup(record.label) === 'LONG')
  const shortRecords = records.filter(record => stockLabelGroup(record.label) === 'SHORT')

  return {
    longCount: longRecords.length,
    shortCount: shortRecords.length,
    excess5dLong: average(longRecords.flatMap(record => (record.ret5dVsSpy === null ? [] : [record.ret5dVsSpy]))),
    excess5dShort: average(shortRecords.flatMap(record => (record.ret5dVsSpy === null ? [] : [record.ret5dVsSpy]))),
  }
}

type StockReplaySummary = {
  total: number
  longCount: number
  shortCount: number
  longWinRate5d: number | null
  longWinRate10d: number | null
  shortWinRate5d: number | null
  shortWinRate10d: number | null
  longAvg5d: number | null
  longAvg10d: number | null
  shortAvg5d: number | null
  shortAvg10d: number | null
}

function buildStockReplaySummary(records: ForwardReturnRecord[]): StockReplaySummary {
  const longRecs = records.filter(r => stockLabelGroup(r.label) === 'LONG')
  const shortRecs = records.filter(r => stockLabelGroup(r.label) === 'SHORT')

  const winRate = (recs: ForwardReturnRecord[], isLong: boolean, field: 'ret5d' | 'ret10d'): number | null => {
    const withData = recs.filter(r => r[field] !== null)
    if (withData.length === 0) return null
    const wins = withData.filter(r => isLong ? (r[field] ?? 0) > 0 : (r[field] ?? 0) < 0)
    return wins.length / withData.length
  }

  return {
    total: records.length,
    longCount: longRecs.length,
    shortCount: shortRecs.length,
    longWinRate5d: winRate(longRecs, true, 'ret5d'),
    longWinRate10d: winRate(longRecs, true, 'ret10d'),
    shortWinRate5d: winRate(shortRecs, false, 'ret5d'),
    shortWinRate10d: winRate(shortRecs, false, 'ret10d'),
    longAvg5d: average(longRecs.flatMap(r => r.ret5d === null ? [] : [r.ret5d])),
    longAvg10d: average(longRecs.flatMap(r => r.ret10d === null ? [] : [r.ret10d])),
    shortAvg5d: average(shortRecs.flatMap(r => r.ret5d === null ? [] : [r.ret5d])),
    shortAvg10d: average(shortRecs.flatMap(r => r.ret10d === null ? [] : [r.ret10d]))
  }
}

function returnClass(ret: number | null, label: StockSignalLabel): string {
  if (ret === null) return ''
  const group = stockLabelGroup(label)
  const correct = group === 'LONG' ? ret > 0 : group === 'SHORT' ? ret < 0 : ret > 0
  return correct ? 'gate-pass' : 'gate-fail'
}

function pageIntro(activeTab: TabId, stockState: StockState): { eyebrow: string; title: string; description: string; zhSubtitle: string } {
  switch (activeTab) {
    case 'ETF Weekly':
      return {
        eyebrow: 'DataHealth',
        title: 'ETF + US Stocks Signal App',
        description: 'ETF Weekly is reading live Yahoo history and classifying the current universe.',
        zhSubtitle: '每週 ETF 評級 — 🟢 值得留意  🟡 先觀察  🔴 避開'
      }
    case 'ETF Replay':
      return {
        eyebrow: 'Replay',
        title: 'ETF Recommendation Replay',
        description: 'Replay shows the last 26 completed weeks using only data available at each point in time.',
        zhSubtitle: '過去 26 週信號回放，驗證每個評級的實際表現'
      }
    case 'Stock Screener':
      return {
        eyebrow: 'Screener',
        title: 'US Stock Tactical Screener',
        description: stockState.earningsConfigured
          ? 'Daily stock signals are live with Yahoo price history and Finnhub earnings risk.'
          : 'Daily stock signals are live from Yahoo history. Add Finnhub earnings risk by configuring FINNHUB_API_KEY.',
        zhSubtitle: '每日股票信號 — 升降分析（研究階段，非投資建議）'
      }
    case 'Stock Replay':
      return {
        eyebrow: 'Stock Replay',
        title: 'Stock Signal History',
        description: 'Per-ticker signal replay: every past signal label with its actual forward return outcome.',
        zhSubtitle: '個股信號歷史回放 — 觀察過去每個信號實際結果'
      }
    case 'Stock Research':
      return {
        eyebrow: 'Research',
        title: 'Signal Research Workspace',
        description: 'Research mode will store forward returns and indicator evidence before locking production rules.',
        zhSubtitle: '信號統計驗證工作區 — 六關卡 Gate 系統'
      }
  }
}

function buildHeroMetrics(input: {
  activeTab: TabId
  counts: Record<ETFRecommendation['label'], number>
  stockCounts: Record<'LONG' | 'SHORT' | 'NEUTRAL' | 'REVIEW', number>
  filteredReplayRows: ReplayRow[]
  replayAnalytics: ReplayAnalytics
  stockReplayTicker: string
  stockReplaySummary: StockReplaySummary
  researchRecords: number
  passedLabels: number
  longExcess5d: number | null
  earningsConfigured: boolean
}): HeroMetric[] {
  const {
    activeTab,
    counts,
    stockCounts,
    filteredReplayRows,
    replayAnalytics,
    stockReplayTicker,
    stockReplaySummary,
    researchRecords,
    passedLabels,
    longExcess5d,
    earningsConfigured
  } = input

  switch (activeTab) {
    case 'ETF Weekly':
      return [
        { label: 'Favour', value: String(counts.FAVOUR), note: '值得留意', tone: 'gain' },
        { label: 'Watch', value: String(counts.WATCH), note: '留意觀望', tone: 'info' },
        { label: 'Avoid', value: String(counts.AVOID), note: '走勢偏弱', tone: 'warn' }
      ]
    case 'ETF Replay':
      return [
        { label: 'Replay Rows', value: String(filteredReplayRows.length), note: '回放樣本', tone: 'info' },
        { label: 'Favour > SPY 4W', value: formatPercent(replayAnalytics.favourBeatSpy4wRate), note: '勝率', tone: 'gain' },
        { label: 'Avg 4W Excess', value: formatPercent(replayAnalytics.favourExcess4w), note: '超額回報', tone: 'violet' }
      ]
    case 'Stock Screener':
      return [
        { label: 'Active Long', value: String(stockCounts.LONG), note: '今日升勢焦點', tone: 'gain' },
        { label: 'Neutral Flow', value: String(stockCounts.NEUTRAL), note: '等待進一步確認', tone: 'info' },
        { label: 'Earnings Guard', value: earningsConfigured ? 'ON' : 'OFF', note: '財報風險過濾', tone: 'warn' }
      ]
    case 'Stock Replay':
      return [
        { label: 'Ticker', value: stockReplayTicker, note: '回放標的', tone: 'info' },
        { label: 'Signals', value: String(stockReplaySummary.total), note: '歷史信號數', tone: 'gain' },
        { label: '5D Win Rate', value: formatPercent(stockReplaySummary.longWinRate5d), note: '長邊方向勝率', tone: 'violet' }
      ]
    case 'Stock Research':
      return [
        { label: 'Records', value: String(researchRecords), note: '研究樣本', tone: 'info' },
        { label: 'Pass Labels', value: String(passedLabels), note: '通過六關卡', tone: 'gain' },
        { label: 'Long Excess 5D', value: formatPercent(longExcess5d), note: '升勢超額回報', tone: 'violet' }
      ]
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('ETF Weekly')
  const [weeklyState, setWeeklyState] = useState<WeeklyState>({
    rows: [],
    replayRows: [],
    histories: {},
    failedTickers: [],
    regime: 'neutral',
    lastUpdated: null
  })
  const [isLoadingWeekly, setIsLoadingWeekly] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedReplayTicker, setSelectedReplayTicker] = useState<string>('ALL')
  const [stockState, setStockState] = useState<StockState>({
    histories: {},
    rows: [],
    failedTickers: [],
    lastUpdated: null,
    earningsConfigured: false,
    regime: 'neutral'
  })
  const [isLoadingStocks, setIsLoadingStocks] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)
  const [researchState, setResearchState] = useState<ResearchState>({
    records: [],
    lastUpdated: null
  })
  const [isLoadingResearch, setIsLoadingResearch] = useState(false)
  const [researchError, setResearchError] = useState<string | null>(null)
  const [selectedStockReplayTicker, setSelectedStockReplayTicker] = useState<string>(stockWatchlist[0]?.ticker ?? '')
  const [showGateLegend, setShowGateLegend] = useState(false)
  const [selectedResearchLabel, setSelectedResearchLabel] = useState<StockSignalLabel | 'ALL'>('ALL')
  const [stockViewMode, setStockViewMode] = useState<'table' | 'cards'>('cards')
  const [onboardingStep, setOnboardingStep] = useState<number | null>(() =>
    typeof window !== 'undefined' && window.localStorage.getItem('onboarding_v1_done') ? null : 1
  )
  const [showHelp, setShowHelp] = useState(false)
  const [etfReplayExpanded, setEtfReplayExpanded] = useState(false)
  const [stockReplayExpanded, setStockReplayExpanded] = useState(false)

  async function loadWeeklyData() {
    setIsLoadingWeekly(true)
    setLoadError(null)

    try {
      const tickers = [...new Set([...etfUniverse.map(etf => etf.ticker), ...BENCHMARK_TICKERS])]
      const results = await Promise.allSettled(tickers.map(ticker => fetchYahooTickerHistory(ticker)))
      const histories: Record<string, TickerHistory> = {}
      const failedTickers: string[] = []

      results.forEach((result, index) => {
        const ticker = tickers[index]

        if (result.status === 'fulfilled') {
          histories[ticker] = result.value
          return
        }

        failedTickers.push(ticker)
      })

      const regimeInputs = deriveRegimeInputsFromHistories(histories)
      const regime = classifyRegime(regimeInputs)
      const rows = buildWeeklyRows(histories, regime)
      const replayRows = buildReplayRows(histories)

      setWeeklyState({
        rows,
        replayRows,
        histories,
        failedTickers,
        regime,
        lastUpdated: new Date().toISOString()
      })

      if (rows.length === 0) {
        setLoadError('No ETF histories were available.')
      } else if (failedTickers.length > 0) {
        setLoadError(`Some tickers failed to load: ${failedTickers.slice(0, 6).join(', ')}`)
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load ETF histories.')
    } finally {
      setIsLoadingWeekly(false)
    }
  }

  useEffect(() => {
    void loadWeeklyData()
  }, [])

  async function fetchStockHistories(): Promise<{
    histories: Record<string, TickerHistory>
    failedTickers: string[]
  }> {
    const tickers = [...new Set([...stockWatchlist.map(stock => stock.ticker), ...STOCK_BENCHMARK_TICKERS])]
    const results = await Promise.allSettled(tickers.map(ticker => fetchYahooTickerHistory(ticker)))
    const histories: Record<string, TickerHistory> = {}
    const failedTickers: string[] = []

    results.forEach((result, index) => {
      const ticker = tickers[index]

      if (result.status === 'fulfilled') {
        histories[ticker] = result.value
        return
      }

      failedTickers.push(ticker)
    })

    return { histories, failedTickers }
  }

  async function loadStockData() {
    setIsLoadingStocks(true)
    setStockError(null)

    try {
      const { histories, failedTickers } = await fetchStockHistories()

      const regime = classifyRegime(deriveRegimeInputsFromHistories(histories))
      let earningsDates = new Map<string, string | null>()
      let earningsConfigured = true
      let nextStockError: string | null = null

      try {
        earningsDates = await fetchEarningsCalendar(stockWatchlist.map(stock => stock.ticker))
      } catch (error) {
        earningsConfigured = false
        nextStockError = error instanceof Error ? error.message : 'Failed to load earnings calendar.'
      }

      const rows = buildStockRows(histories, regime, earningsDates)

      setStockState({
        histories,
        rows,
        failedTickers,
        lastUpdated: new Date().toISOString(),
        earningsConfigured,
        regime
      })

      if (rows.length === 0) {
        nextStockError = 'No stock histories were available.'
      } else if (failedTickers.length > 0 && nextStockError === null) {
        nextStockError = `Some stock tickers failed to load: ${failedTickers.slice(0, 6).join(', ')}`
      }

      setStockError(nextStockError)
    } catch (error) {
      setStockError(error instanceof Error ? error.message : 'Failed to load stock histories.')
    } finally {
      setIsLoadingStocks(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'Stock Screener' && stockState.rows.length === 0 && !isLoadingStocks) {
      void loadStockData()
    }
  }, [activeTab, stockState.rows.length, isLoadingStocks])

  async function loadResearchData() {
    setIsLoadingResearch(true)
    setResearchError(null)

    try {
      const histories =
        Object.keys(stockState.histories).length > 0 ? stockState.histories : (await fetchStockHistories()).histories
      // A4: fetch historical earnings so replay signals respect earningsWithinWindow
      const replayEndDate = new Date().toISOString().slice(0, 10)
      const replayStartDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      let historicalEarnings = new Map<string, string[]>()
      try {
        historicalEarnings = await fetchHistoricalEarningsMap(
          stockWatchlist.map(stock => stock.ticker),
          replayStartDate,
          replayEndDate
        )
      } catch {
        // earnings integration is optional — silently fall back to null earningsDate
      }

      const signals = buildHistoricalSignals(
        histories,
        stockWatchlist.map(stock => stock.ticker),
        180,
        historicalEarnings
      )
      const records = buildForwardReturnRecord(signals, histories).sort((left, right) => {
        if (left.signalDate !== right.signalDate) {
          return right.signalDate.localeCompare(left.signalDate)
        }

        return stockResearchLabelPriority(left.label) - stockResearchLabelPriority(right.label)
      })

      setResearchState({
        records,
        lastUpdated: new Date().toISOString()
      })

      if (records.length === 0) {
        setResearchError('No research records were generated from the current watchlist histories.')
      }
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : 'Failed to build stock research dataset.')
    } finally {
      setIsLoadingResearch(false)
    }
  }

  useEffect(() => {
    if ((activeTab === 'Stock Research' || activeTab === 'Stock Replay') && researchState.records.length === 0 && !isLoadingResearch) {
      void loadResearchData()
    }
  }, [activeTab, researchState.records.length, isLoadingResearch, stockState.histories])

  const counts = labelCounts(weeklyState.rows)
  const replayTickerOptions = ['ALL', ...etfUniverse.map(etf => etf.ticker)]
  const filteredReplayRows =
    selectedReplayTicker === 'ALL'
      ? weeklyState.replayRows
      : weeklyState.replayRows.filter(row => row.ticker === selectedReplayTicker)
  const replaySummary = buildReplaySummary(filteredReplayRows)
  const spyReplayRows =
    weeklyState.histories.SPY && selectedReplayTicker === 'ALL'
      ? replayETF(weeklyState.histories.SPY, weeklyState.histories, REPLAY_WEEKS)
      : []
  const replayAnalytics = buildReplayAnalytics(filteredReplayRows, spyReplayRows)
  const stockCounts = countStockGroups(stockState.rows)
  const gateResults = evaluateAllGates(researchState.records)
  const researchDirectional = countDirectionalResearch(researchState.records)
  const intro = pageIntro(activeTab, stockState)
  const isResearchTab = activeTab === 'Stock Research' || activeTab === 'Stock Replay'
  const activeRegime =
    activeTab === 'Stock Screener' || activeTab === 'Stock Replay' || activeTab === 'Stock Research'
      ? stockState.regime
      : weeklyState.regime
  const regimeBanner = getRegimeBanner(activeRegime)
  const heroLoadedCount = activeTab === 'Stock Screener' ? stockState.rows.length : isResearchTab ? researchState.records.length : Object.keys(weeklyState.histories).length
  const heroFailedCount = activeTab === 'Stock Screener' ? stockState.failedTickers.length : isResearchTab ? 0 : weeklyState.failedTickers.length
  const heroUpdatedAt = activeTab === 'Stock Screener' ? stockState.lastUpdated : isResearchTab ? researchState.lastUpdated : weeklyState.lastUpdated
  const stockReplayRecords = researchState.records.filter(r => r.ticker === selectedStockReplayTicker)
  const stockReplaySummary = buildStockReplaySummary(stockReplayRecords)
  const passedResearchLabels = gateResults.filter(result => result.status === 'PASS').length
  const filteredResearchRecords = selectedResearchLabel === 'ALL'
    ? researchState.records
    : researchState.records.filter(r => r.label === selectedResearchLabel)
  const researchFilterStats = (() => {
    const recs = filteredResearchRecords
    const with5d = recs.filter(r => r.ret5d !== null)
    const avg5d = with5d.length > 0 ? with5d.reduce((s, r) => s + (r.ret5d ?? 0), 0) / with5d.length : null
    const directional5d = with5d.filter(r => stockLabelGroup(r.label as StockSignalLabel) === 'LONG' || stockLabelGroup(r.label as StockSignalLabel) === 'SHORT')
    const wins5d = directional5d.filter(r => stockLabelGroup(r.label as StockSignalLabel) === 'LONG' ? (r.ret5d ?? 0) > 0 : (r.ret5d ?? 0) < 0).length
    const winRate5d = directional5d.length > 0 ? wins5d / directional5d.length : null
    return { n: recs.length, avg5d, winRate5d }
  })()
  const heroMetrics = buildHeroMetrics({
    activeTab,
    counts,
    stockCounts,
    filteredReplayRows,
    replayAnalytics,
    stockReplayTicker: selectedStockReplayTicker,
    stockReplaySummary,
    researchRecords: researchState.records.length,
    passedLabels: passedResearchLabels,
    longExcess5d: researchDirectional.excess5dLong,
    earningsConfigured: stockState.earningsConfigured
  })
  return (
    <main className="app-shell">
      <div className="workspace">
        {/* ── HERO CARD ── */}
        <section className="panel hero-card">
          <div className="hero-card__glow" aria-hidden="true" />
          <p className="eyebrow">{intro.eyebrow}</p>
          <h1>{intro.title}</h1>
          <p className="subtle">{intro.description}</p>
          <p className="zh-subtitle">{intro.zhSubtitle}</p>

          <div className={`regime-banner ${regimeBanner.colorClass}`}>
            <span className="regime-banner__emoji">{regimeBanner.emoji}</span>
            <div>
              <strong>{regimeBanner.zhText}</strong>
              <div className="regime-en">Market Regime · {regimeBanner.enText}</div>
            </div>
          </div>

          <div className="status-row">
            <span className="status-chip">
              Regime: <strong>{regimeSummary(activeRegime)}</strong>
            </span>
            <span className="status-chip">
              Loaded: <strong>{heroLoadedCount}</strong>
            </span>
            <span className="status-chip">
              Failed: <strong>{heroFailedCount}</strong>
            </span>
            <span className="status-chip">
              Updated:{' '}
              <strong>
                {heroUpdatedAt
                  ? new Date(heroUpdatedAt).toLocaleString('en-HK', { hour12: false })
                  : 'pending'}
              </strong>
            </span>
          </div>

          <div className="hero-metric-strip">
            {heroMetrics.map(metric => (
              <article key={metric.label} className={`hero-metric hero-metric--${metric.tone}`}>
                <span className="hero-metric__label">{metric.label}</span>
                <strong className="hero-metric__value"><AnimatedMetricValue value={metric.value} /></strong>
                <span className="hero-metric__note">{metric.note}</span>
              </article>
            ))}
          </div>

          {/* Research-phase disclaimer */}
          <p className="disclaimer-inline">
            ⚠️ 研究階段 · 參考工具，非投資建議 · 最後決定喺你自己
          </p>

          {activeTab === 'Stock Screener'
            ? stockError ? <div className="warning">{stockError}</div> : null
            : loadError ? <div className="warning">{loadError}</div> : null}
        </section>

        {/* ── TAB NAV ── */}
        <nav aria-label="Workspace tabs" className="segmented-control">
          {tabs.map(tab => (
            <button
              key={tab}
              type="button"
              className={tab === activeTab ? 'segmented-control__button is-active' : 'segmented-control__button'}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* ── ETF WEEKLY ── */}
        {activeTab === 'ETF Weekly' ? (
          <>
            <section className="dashboard-grid wide">
              <article className={`panel ${summaryToneClass('gain')}`}>
                <h2>🟢 Favour 值得留意</h2>
                <strong><AnimatedMetricValue value={String(counts.FAVOUR)} /></strong>
                <span>走勢及動力偏強</span>
              </article>
              <article className={`panel ${summaryToneClass('warn')}`}>
                <h2>🟡 Watch 留意觀望</h2>
                <strong><AnimatedMetricValue value={String(counts.WATCH)} /></strong>
                <span>有改善跡象，未到位</span>
              </article>
              <article className={`panel ${summaryToneClass('loss')}`}>
                <h2>🔴 Avoid 避開</h2>
                <strong><AnimatedMetricValue value={String(counts.AVOID)} /></strong>
                <span>走勢偏弱，避免持倉</span>
              </article>
              <article className={`panel ${summaryToneClass('violet')}`}>
                <h2>⚫ Review 資料不足</h2>
                <strong><AnimatedMetricValue value={String(counts.REVIEW)} /></strong>
                <span>Missing or insufficient data</span>
              </article>
            </section>

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>ETF Weekly</h2>
                  <p className="subtle">
                    Latest completed-history classification using Yahoo daily OHLCV, weekly aggregation, and
                    simplified regime inputs from SPY, QQQ, and VIX.
                  </p>
                </div>
                <div className="header-actions">
                  <button type="button" className="refresh-button" disabled={isLoadingWeekly} onClick={() => void loadWeeklyData()}>
                    {isLoadingWeekly ? 'Refreshing...' : 'Refresh Live Data'}
                  </button>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Name</th>
                      <th>信號 Label</th>
                      <th>13W Return</th>
                      <th>Price / 40W MA</th>
                      <th>Reason 原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyState.rows.map(row => {
                      const disp = getETFLabelDisplay(row.label)
                      return (
                        <tr key={row.ticker}>
                          <td>{row.ticker}</td>
                          <td>{row.name}</td>
                          <td>
                            <div className="label-cell">
                              <span className={`label-pill label-pill--${row.label.toLowerCase()}`}>
                                {disp.lightEmoji} {disp.zhText}
                              </span>
                              <span className="label-code">{row.label}</span>
                            </div>
                          </td>
                          <td>{formatPercent(row.return13w)}</td>
                          <td>{formatRatio(row.priceVs40wMa)}</td>
                          <td className="reason-cell">
                            <span className="reason-plain">{disp.plainReason}</span>
                            <span className="reason-technical">{row.reason}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>

        ) : activeTab === 'ETF Replay' ? (
          <>
            <section className="dashboard-grid wide">
              {replaySummary.map(item => {
                const disp = getETFLabelDisplay(item.label)
                return (
                  <article className={`panel ${summaryToneClass(etfLabelTone(item.label))}`} key={item.label}>
                    <h2>{disp.lightEmoji} {item.label}</h2>
                    <strong><AnimatedMetricValue value={String(item.count)} /></strong>
                    <span>
                      1W {formatPercent(item.avgRet1w)} | 4W {formatPercent(item.avgRet4w)}
                    </span>
                  </article>
                )
              })}
            </section>

            <section className="dashboard-grid wide">
              <article className={`panel ${summaryToneClass('gain')}`}>
                <h2>Favour Beat SPY 1W</h2>
                <strong><AnimatedMetricValue value={formatPercent(replayAnalytics.favourBeatSpy1wRate)} /></strong>
                <span>Avg excess {formatPercent(replayAnalytics.favourExcess1w)}</span>
              </article>
              <article className={`panel ${summaryToneClass('info')}`}>
                <h2>Favour Beat SPY 4W</h2>
                <strong><AnimatedMetricValue value={formatPercent(replayAnalytics.favourBeatSpy4wRate)} /></strong>
                <span>Avg excess {formatPercent(replayAnalytics.favourExcess4w)}</span>
              </article>
              <article className={`panel ${summaryToneClass('warn')}`}>
                <h2>Favour vs Avoid 1W</h2>
                <strong>
                  <AnimatedMetricValue value={String(replayAnalytics.favourVsAvoidWins1w)} />/{replayAnalytics.favourVsAvoidWeeks1w}
                </strong>
                <span>Weeks where avg FAVOUR beat avg AVOID</span>
              </article>
              <article className={`panel ${summaryToneClass('violet')}`}>
                <h2>Favour vs Avoid 4W</h2>
                <strong>
                  <AnimatedMetricValue value={String(replayAnalytics.favourVsAvoidWins4w)} />/{replayAnalytics.favourVsAvoidWeeks4w}
                </strong>
                <span>Weeks where avg FAVOUR beat avg AVOID</span>
              </article>
            </section>

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>ETF Replay</h2>
                  <p className="subtle">
                    Rolling {REPLAY_WEEKS}-week recommendation replay using only data available up to each week.
                  </p>
                  {selectedReplayTicker !== 'ALL' ? (
                    <p className="subtle">SPY and FAVOUR-vs-AVOID analytics are most meaningful in `ALL` scope.</p>
                  ) : null}
                </div>
                <div className="header-actions">
                  <label>
                    Replay Ticker
                    <select value={selectedReplayTicker} onChange={event => setSelectedReplayTicker(event.target.value)}>
                      {replayTickerOptions.map(ticker => (
                        <option key={ticker} value={ticker}>
                          {ticker}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="refresh-button" disabled={isLoadingWeekly} onClick={() => void loadWeeklyData()}>
                    {isLoadingWeekly ? 'Refreshing...' : 'Refresh Live Data'}
                  </button>
                </div>
              </div>

              {(() => {
                const collapseLimit = Math.max(1, Math.ceil(filteredReplayRows.length / 3))
                const displayedRows = etfReplayExpanded ? filteredReplayRows : filteredReplayRows.slice(0, collapseLimit)
                return (
                  <>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Week Ending</th>
                            <th>Ticker</th>
                            <th>Name</th>
                            <th>信號 Label</th>
                            <th>1W Return</th>
                            <th>4W Return</th>
                            <th>13W Return</th>
                            <th>Price / 40W MA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedRows.map(row => {
                            const disp = getETFLabelDisplay(row.label)
                            return (
                              <tr key={`${row.ticker}:${row.weekEndingDate}`}>
                                <td>{row.weekEndingDate}</td>
                                <td>{row.ticker}</td>
                                <td>{row.name}</td>
                                <td>
                                  <div className="label-cell">
                                    <span className={`label-pill label-pill--${row.label.toLowerCase()}`}>
                                      {disp.lightEmoji} {disp.zhText}
                                    </span>
                                    <span className="label-code">{row.label}</span>
                                  </div>
                                </td>
                                <td>{formatPercent(row.ret1w)}</td>
                                <td>{formatPercent(row.ret4w)}</td>
                                <td>{formatPercent(row.indicators.return13w)}</td>
                                <td>{formatRatio(row.indicators.priceVs40wMa)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="expand-row">
                      <button type="button" className="expand-btn" onClick={() => setEtfReplayExpanded(prev => !prev)}>
                        {etfReplayExpanded
                          ? `▲ 收起 Collapse (showing ${filteredReplayRows.length})`
                          : `▼ 展開 Expand — showing ${collapseLimit} / ${filteredReplayRows.length} rows`}
                      </button>
                    </div>
                  </>
                )
              })()}
            </section>
          </>

        ) : activeTab === 'Stock Screener' ? (
          <>
            <section className="panel hero-card wide">
              <p className="eyebrow">Screener Status</p>
              <h2>Stock Screener 股票信號</h2>
              <p className="subtle">
                Live Yahoo daily histories for {stockWatchlist.length} watchlist names, with Finnhub earnings risk when
                `FINNHUB_API_KEY` is configured.
              </p>
              <div className="status-row">
                <span className="status-chip">
                  Universe: <strong>{stockWatchlist.length}</strong>
                </span>
                <span className="status-chip">
                  🟢 Long Bias: <strong>{stockCounts.LONG}</strong>
                </span>
                <span className="status-chip">
                  🔴 Short Bias: <strong>{stockCounts.SHORT}</strong>
                </span>
                <span className="status-chip">
                  Earnings:{' '}
                  <strong>{stockState.earningsConfigured ? 'active' : 'not configured'}</strong>
                </span>
                <span className="status-chip">
                  Updated:{' '}
                  <strong>
                    {stockState.lastUpdated
                      ? new Date(stockState.lastUpdated).toLocaleString('en-HK', { hour12: false })
                      : 'pending'}
                  </strong>
                </span>
              </div>
              {stockError ? <div className="warning">{stockError}</div> : null}
            </section>

            <section className="dashboard-grid wide">
              <article className={`panel ${summaryToneClass('gain')}`}>
                <h2>🟢 Long Labels 升勢</h2>
                <strong><AnimatedMetricValue value={String(stockCounts.LONG)} /></strong>
                <span>LONG_* and UP_PROMOTION</span>
              </article>
              <article className={`panel ${summaryToneClass('loss')}`}>
                <h2>🔴 Short Labels 跌勢</h2>
                <strong><AnimatedMetricValue value={String(stockCounts.SHORT)} /></strong>
                <span>SHORT_* and DOWN_PROMOTION</span>
              </article>
              <article className={`panel ${summaryToneClass('warn')}`}>
                <h2>🟠 Neutral 中性</h2>
                <strong><AnimatedMetricValue value={String(stockCounts.NEUTRAL)} /></strong>
                <span>NEUTRAL and AVOID_CHOP</span>
              </article>
              <article className={`panel ${summaryToneClass('violet')}`}>
                <h2>⚫ Review 待確認</h2>
                <strong><AnimatedMetricValue value={String(stockCounts.REVIEW)} /></strong>
                <span>Data or event-quality blockers</span>
              </article>
            </section>

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>Live Signals 即時信號</h2>
                  <p className="subtle">
                    First-pass tactical labels from local EMA/RSI/MACD/CMF/RVOL/ATR calculations on daily OHLCV.
                    「原因」欄：中文一句點解 + 技術細節。
                  </p>
                </div>
                <div className="header-actions">
                  <div className="view-toggle">
                    <button
                      type="button"
                      className={`view-toggle__btn${stockViewMode === 'cards' ? ' view-toggle__btn--active' : ''}`}
                      onClick={() => setStockViewMode('cards')}
                    >卡片</button>
                    <button
                      type="button"
                      className={`view-toggle__btn${stockViewMode === 'table' ? ' view-toggle__btn--active' : ''}`}
                      onClick={() => setStockViewMode('table')}
                    >列表</button>
                  </div>
                  <button type="button" className="refresh-button" disabled={isLoadingStocks} onClick={() => void loadStockData()}>
                    {isLoadingStocks ? 'Refreshing...' : 'Refresh Screener'}
                  </button>
                </div>
              </div>

              {stockViewMode === 'cards' ? (
                <div className="stock-card-grid">
                  {stockState.rows.map((row, index) => {
                    const disp = getStockLabelDisplay(row.label)
                    const group = stockLabelGroup(row.label).toLowerCase()
                    const featured = index < 4
                    return (
                      <div
                        key={row.ticker}
                        className={`stock-card stock-card--${group}${featured ? ' stock-card--featured' : ''}`}
                        style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
                      >
                        <div className="stock-card__topline">
                          {featured ? <span className="stock-card__featured-tag">Featured Focus</span> : <span className="stock-card__topline-spacer" aria-hidden="true" />}
                          <span className={`label-pill label-pill--stock label-pill--stock-${group}`}>
                            {disp.lightEmoji} {disp.zhText}
                          </span>
                        </div>
                        <div className="stock-card__header">
                          <div>
                            <div className="stock-card__ticker">{row.ticker}</div>
                            <div className="stock-card__name">{row.name}</div>
                            <div className="stock-card__sector">{row.sector}</div>
                          </div>
                          <StockSparkline history={stockState.histories[row.ticker]} group={group} />
                        </div>
                        <div className="stock-card__metrics">
                          <span className="stock-card__metric">RSI <strong>{row.rsi14 === null ? 'n/a' : row.rsi14.toFixed(1)}</strong></span>
                          <span className="stock-card__metric">RVOL <strong>{formatRatio(row.rvol)}</strong></span>
                          <span className="stock-card__metric">RS <strong>{formatPercent(row.relStrengthVsSpy)}</strong></span>
                          {row.earningsDate ? <span className="stock-card__earnings">財報 {row.earningsDate}</span> : null}
                        </div>
                        <div className="stock-card__reason">{disp.plainReason}</div>
                        <div className="stock-card__footer">
                          <span className={`stock-card__action stock-card__action--${disp.actionGroup}`}>{disp.action}</span>
                          <span className="stock-card__code">{disp.enCode}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ticker</th>
                        <th>Name</th>
                        <th>Sector</th>
                        <th>信號 Label</th>
                        <th>RSI(14)</th>
                        <th>RVOL</th>
                        <th>RS vs SPY</th>
                        <th>原因 Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockState.rows.map(row => {
                        const disp = getStockLabelDisplay(row.label)
                        const group = stockLabelGroup(row.label).toLowerCase()
                        return (
                          <tr key={row.ticker}>
                            <td>{row.ticker}</td>
                            <td>{row.name}</td>
                            <td>{row.sector}</td>
                            <td>
                              <div className="label-cell">
                                <span className={`label-pill label-pill--stock label-pill--stock-${group}`}>
                                  {disp.lightEmoji} {disp.zhText}
                                </span>
                                <span className="label-code">{row.label}</span>
                              </div>
                            </td>
                            <td>{row.rsi14 === null ? 'n/a' : row.rsi14.toFixed(1)}</td>
                            <td>{formatRatio(row.rvol)}</td>
                            <td>{formatPercent(row.relStrengthVsSpy)}</td>
                            <td className="reason-cell">
                              <span className="reason-plain">{disp.plainReason}</span>
                              <span className="reason-technical">{row.reason}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>

        ) : activeTab === 'Stock Replay' ? (
          <>
            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>個股信號歷史 Signal History</h2>
                  <p className="subtle">
                    Every past signal label with actual forward-return outcome. Entry = next-bar open (HYP-012).
                    Colour = directional correctness — 🟢 signal worked, 🔴 signal failed.
                  </p>
                  <p className="subtle">綠色 = 信號方向正確；紅色 = 方向錯誤。</p>
                </div>
                <div className="header-actions">
                  <label>
                    股票 Ticker
                    <select value={selectedStockReplayTicker} onChange={event => setSelectedStockReplayTicker(event.target.value)}>
                      {stockWatchlist.map(s => (
                        <option key={s.ticker} value={s.ticker}>{s.ticker} — {s.name}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="refresh-button" disabled={isLoadingResearch} onClick={() => void loadResearchData()}>
                    {isLoadingResearch ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
              </div>
            </section>

            {(() => {
              const sum = stockReplaySummary
              return (
                <section className="dashboard-grid wide">
                  <article className={`panel ${summaryToneClass('gain')}`}>
                    <h2>🟢 Long 升勢信號</h2>
                    <strong>n = <AnimatedMetricValue value={String(sum.longCount)} /></strong>
                    <span>5D 方向勝率 {formatPercent(sum.longWinRate5d)}</span>
                    <span>10D 方向勝率 {formatPercent(sum.longWinRate10d)}</span>
                  </article>
                  <article className={`panel ${summaryToneClass('loss')}`}>
                    <h2>🔴 Short 跌勢信號</h2>
                    <strong>n = <AnimatedMetricValue value={String(sum.shortCount)} /></strong>
                    <span>5D 方向勝率 {formatPercent(sum.shortWinRate5d)}</span>
                    <span>10D 方向勝率 {formatPercent(sum.shortWinRate10d)}</span>
                  </article>
                  <article className={`panel ${summaryToneClass('info')}`}>
                    <h2>↑ Long 平均回報</h2>
                    <strong><AnimatedMetricValue value={formatPercent(sum.longAvg5d)} /></strong>
                    <span>5D avg · 10D {formatPercent(sum.longAvg10d)}</span>
                  </article>
                  <article className={`panel ${summaryToneClass('warn')}`}>
                    <h2>↓ Short 平均回報</h2>
                    <strong><AnimatedMetricValue value={formatPercent(sum.shortAvg5d)} /></strong>
                    <span>5D avg · 10D {formatPercent(sum.shortAvg10d)}</span>
                  </article>
                </section>
              )
            })()}

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>歷史記錄 All Signals — {selectedStockReplayTicker}</h2>
                  <p className="subtle">{stockReplayRecords.length} signals in 180-bar replay window</p>
                </div>
              </div>
              {(() => {
                const collapseLimit = Math.max(1, Math.ceil(stockReplayRecords.length / 3))
                const displayedRecords = stockReplayExpanded ? stockReplayRecords : stockReplayRecords.slice(0, collapseLimit)
                return (
                  <>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>日期 Date</th>
                            <th>信號 Label</th>
                            <th>Regime</th>
                            <th>Close $</th>
                            <th>1D</th>
                            <th>3D</th>
                            <th>5D</th>
                            <th>10D</th>
                            <th>5D vs SPY</th>
                            <th>MFE 5D</th>
                            <th>MAE 5D</th>
                            <th>E?</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedRecords.map(record => {
                            const disp = getStockLabelDisplay(record.label)
                            const group = stockLabelGroup(record.label).toLowerCase()
                            return (
                              <tr key={`${record.signalDate}:${record.label}`}>
                                <td>{record.signalDate}</td>
                                <td>
                                  <div className="label-cell">
                                    <span className={`label-pill label-pill--stock label-pill--stock-${group}`}>
                                      {disp.lightEmoji} {disp.zhText}
                                    </span>
                                    <span className="label-code">{record.label}</span>
                                  </div>
                                </td>
                                <td>{record.regimeAtSignal}</td>
                                <td>{record.closeAtSignal.toFixed(2)}</td>
                                <td className={returnClass(record.ret1d, record.label)}>{formatPercent(record.ret1d)}</td>
                                <td className={returnClass(record.ret3d, record.label)}>{formatPercent(record.ret3d)}</td>
                                <td className={returnClass(record.ret5d, record.label)}>{formatPercent(record.ret5d)}</td>
                                <td className={returnClass(record.ret10d, record.label)}>{formatPercent(record.ret10d)}</td>
                                <td className={returnClass(record.ret5dVsSpy, record.label)}>{formatPercent(record.ret5dVsSpy)}</td>
                                <td>{formatPercent(record.mfe5d)}</td>
                                <td>{formatPercent(record.mae5d)}</td>
                                <td>{record.earningsInWindow ? '⚠️' : '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="expand-row">
                      <button type="button" className="expand-btn" onClick={() => setStockReplayExpanded(prev => !prev)}>
                        {stockReplayExpanded
                          ? `▲ 收起 Collapse (showing ${stockReplayRecords.length})`
                          : `▼ 展開 Expand — showing ${collapseLimit} / ${stockReplayRecords.length} rows`}
                      </button>
                    </div>
                  </>
                )
              })()}
            </section>
          </>

        ) : activeTab === 'Stock Research' ? (
          <>
            <section className="panel hero-card wide">
              <p className="eyebrow">Research Status</p>
              <h2>Stock Research 信號驗證</h2>
              <p className="subtle">
                Forward-return dataset built from the last 180 signal bars across {stockWatchlist.length} watchlist names. Historical earnings dates loaded via Finnhub when configured.
              </p>
              <p className="zh-subtitle">統計驗證工作區：追蹤每個信號標籤的實際勝率，六個 Gate 全通過才算可信。</p>
              <div className="status-row">
                <span className="status-chip">
                  Records: <strong>{researchState.records.length}</strong>
                </span>
                <span className="status-chip">
                  Long Signals: <strong>{researchDirectional.longCount}</strong>
                </span>
                <span className="status-chip">
                  Short Signals: <strong>{researchDirectional.shortCount}</strong>
                </span>
                <span className="status-chip">
                  Updated:{' '}
                  <strong>
                    {researchState.lastUpdated
                      ? new Date(researchState.lastUpdated).toLocaleString('en-HK', { hour12: false })
                      : 'pending'}
                  </strong>
                </span>
              </div>
              {researchError ? <div className="warning">{researchError}</div> : null}
            </section>

            <section className="dashboard-grid wide">
              <article className={`panel ${summaryToneClass('gain')}`}>
                <h2>Long Excess 5D 升幅超大市</h2>
                <strong><AnimatedMetricValue value={formatPercent(researchDirectional.excess5dLong)} /></strong>
                <span>Mean 5D return vs SPY for long labels</span>
              </article>
              <article className={`panel ${summaryToneClass('loss')}`}>
                <h2>Short Excess 5D 跌幅超大市</h2>
                <strong><AnimatedMetricValue value={formatPercent(researchDirectional.excess5dShort)} /></strong>
                <span>Mean 5D return vs SPY for short labels</span>
              </article>
              <article className={`panel ${summaryToneClass('info')}`}>
                <h2>Dataset Window</h2>
                <strong><AnimatedMetricValue value="180" /> bars</strong>
                <span>Per ticker, excluding the last 10 bars for forward returns</span>
              </article>
              <article className={`panel ${summaryToneClass('violet')}`}>
                <h2>Universe</h2>
                <strong><AnimatedMetricValue value={String(stockWatchlist.length)} /></strong>
                <span>Starter watchlist names included in research</span>
              </article>
            </section>

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>Gate Summary 六關卡驗證</h2>
                  <p className="subtle">
                    G1 n≥100 樣本量 · G2 方向正確 · G3 跑贏大市&gt;0.5% · G4 前後半一致 · G5 中性市仍正確 · G6 MAE&lt;3%
                  </p>
                  <p className="subtle">
                    六個 Gate 全 ✓ 才算通過，目前所有 label 仍在研究階段。
                  </p>
                </div>
                <div className="header-actions">
                  <button type="button" onClick={() => setShowGateLegend(v => !v)} style={{ fontSize: '0.82rem' }}>
                    ? 點睇 Gate 說明
                  </button>
                  <button type="button" className="refresh-button" disabled={isLoadingResearch} onClick={() => void loadResearchData()}>
                    {isLoadingResearch ? 'Refreshing...' : 'Refresh Research'}
                  </button>
                </div>
              </div>

              {showGateLegend && (
                <div className="gate-legend">
                  <button type="button" className="gate-legend__close" onClick={() => setShowGateLegend(false)}>✕</button>
                  <h3>六關卡說明 Gate Criteria</h3>
                  <dl className="gate-legend__list">
                    <dt>G1 — 樣本量</dt>
                    <dd>n ≥ 100。樣本太少，其餘 Gate 的統計無意義。</dd>
                    <dt>G2 — 方向正確</dt>
                    <dd>Long label 的 Avg 5D &gt; 0；Short label 的 Avg 5D &lt; 0。</dd>
                    <dt>G3 — 跑贏大市</dt>
                    <dd>Long label 的 Avg 5D vs SPY &gt; +0.5%；Short label &lt; −0.5%。</dd>
                    <dt>G4 — 前後半一致</dt>
                    <dd>把樣本按時間排序後，前半與後半都要方向正確。防止信號只在某個時期有效。</dd>
                    <dt>G5 — 中性市仍正確</dt>
                    <dd>即使 regime 為 neutral（大市普通），信號的方向仍然正確。需要 ≥ 5 個 neutral 樣本才評估；不足則顯示 INSUFFICIENT。</dd>
                    <dt>G6 — MAE 受控</dt>
                    <dd>5D 內的最大逆向波動（Maximum Adverse Excursion）平均 &lt; 3%。</dd>
                  </dl>
                  <p className="gate-legend__note">所有 label 必須通過 G1–G6 才能正式建議。目前所有 label 仍屬研究階段。</p>
                </div>
              )}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Label 信號</th>
                      <th>n</th>
                      <th>Avg 5D</th>
                      <th>Median 5D</th>
                      <th>vs SPY</th>
                      <th>MAE 5D</th>
                      <th title="n ≥ 100 樣本量">G1</th>
                      <th title="方向正確">G2</th>
                      <th title="跑贏大市 > 0.5%">G3</th>
                      <th title="前後半一致">G4</th>
                      <th title="中性市仍正確">G5</th>
                      <th title="MAE < 3%">G6</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gateResults.map((item: LabelGateResult) => (
                      <tr key={item.label}>
                        <td>
                          <div className="label-cell">
                            <span className={`label-pill label-pill--stock label-pill--stock-${stockLabelGroup(item.label).toLowerCase()}`}>
                              {getStockLabelDisplay(item.label).lightEmoji} {getStockLabelDisplay(item.label).zhText}
                            </span>
                            <span className="label-code">{item.label}</span>
                          </div>
                        </td>
                        <td>{item.count}</td>
                        <td>{formatPercent(item.avgRet5d)}</td>
                        <td>{formatPercent(item.medianRet5d)}</td>
                        <td>{formatPercent(item.avgRet5dVsSpy)}</td>
                        <td>{formatPercent(item.avgMae5d)}</td>
                        <td className={gateClass(item.gate1SampleSize)}>{gateIcon(item.gate1SampleSize)}</td>
                        <td className={gateClass(item.gate2Direction)}>{gateIcon(item.gate2Direction)}</td>
                        <td className={gateClass(item.gate3VsSpy)}>{gateIcon(item.gate3VsSpy)}</td>
                        <td className={gateClass(item.gate4Consistent)}>{gateIcon(item.gate4Consistent)}</td>
                        <td className={gateClass(item.gate5NeutralRegime)}>{gateIcon(item.gate5NeutralRegime)}</td>
                        <td className={gateClass(item.gate6Mae)}>{gateIcon(item.gate6Mae)}</td>
                        <td>
                          <span className={`status-badge status-badge--${item.status.toLowerCase()}`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>Regime Split 大市環境分拆</h2>
                  <p className="subtle">
                    Avg 5D return by signal label across regimes.
                    Gate G5 requires the correct direction in neutral regime.
                  </p>
                  <p className="subtle">大市偏好時升、中性市時仍能升、偏弱市時仍能跌，才是真正可信的信號。</p>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>🟢 long_friendly n</th>
                      <th>Avg 5D</th>
                      <th>🟡 neutral n</th>
                      <th>Avg 5D</th>
                      <th>🔴 short_friendly n</th>
                      <th>Avg 5D</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gateResults.map((item: LabelGateResult) => (
                      <tr key={item.label}>
                        <td>
                          <span className={`label-pill label-pill--stock label-pill--stock-${stockLabelGroup(item.label).toLowerCase()}`}>
                            {getStockLabelDisplay(item.label).lightEmoji} {item.label}
                          </span>
                        </td>
                        <td>{item.regimeSplit.long_friendly.count}</td>
                        <td>{formatPercent(item.regimeSplit.long_friendly.avgRet5d)}</td>
                        <td>{item.regimeSplit.neutral.count}</td>
                        <td>{formatPercent(item.regimeSplit.neutral.avgRet5d)}</td>
                        <td>{item.regimeSplit.short_friendly.count}</td>
                        <td>{formatPercent(item.regimeSplit.short_friendly.avgRet5d)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>Record Explorer 記錄探查</h2>
                  <p className="subtle">
                    {selectedResearchLabel === 'ALL'
                      ? `Showing ${Math.min(filteredResearchRecords.length, 120)} of ${filteredResearchRecords.length} records (most recent first). Select a label to drill down.`
                      : `${filteredResearchRecords.length} records for ${selectedResearchLabel} · Avg 5D ${formatPercent(researchFilterStats.avg5d)} · Win Rate ${formatPercent(researchFilterStats.winRate5d)}`}
                  </p>
                </div>
                <div className="header-actions">
                  <label>
                    Label 信號
                    <select
                      value={selectedResearchLabel}
                      onChange={e => setSelectedResearchLabel(e.target.value as StockSignalLabel | 'ALL')}
                    >
                      <option value="ALL">ALL — 全部</option>
                      <option value="UP_PROMOTION">UP_PROMOTION</option>
                      <option value="LONG_CONFIRM">LONG_CONFIRM</option>
                      <option value="LONG_SETUP">LONG_SETUP</option>
                      <option value="LONG_WATCH">LONG_WATCH</option>
                      <option value="DOWN_PROMOTION">DOWN_PROMOTION</option>
                      <option value="SHORT_CONFIRM">SHORT_CONFIRM</option>
                      <option value="SHORT_SETUP">SHORT_SETUP</option>
                      <option value="SHORT_WATCH">SHORT_WATCH</option>
                      <option value="NEUTRAL">NEUTRAL</option>
                      <option value="AVOID_CHOP">AVOID_CHOP</option>
                      <option value="REVIEW_EVENT">REVIEW_EVENT</option>
                      <option value="REVIEW_DATA">REVIEW_DATA</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Ticker</th>
                      <th>Label</th>
                      <th>Regime</th>
                      <th>5D</th>
                      <th>10D</th>
                      <th>5D vs SPY</th>
                      <th>MFE 5D</th>
                      <th>MAE 5D</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResearchRecords.slice(0, selectedResearchLabel === 'ALL' ? 120 : 500).map(record => (
                      <tr key={`${record.signalDate}:${record.ticker}:${record.label}`}>
                        <td>{record.signalDate}</td>
                        <td>{record.ticker}</td>
                        <td>
                          <span className={`label-pill label-pill--stock label-pill--stock-${stockLabelGroup(record.label).toLowerCase()}`}>
                            {getStockLabelDisplay(record.label).lightEmoji} {record.label}
                          </span>
                        </td>
                        <td>{record.regimeAtSignal}</td>
                        <td className={returnClass(record.ret5d, record.label)}>{formatPercent(record.ret5d)}</td>
                        <td className={returnClass(record.ret10d, record.label)}>{formatPercent(record.ret10d)}</td>
                        <td className={returnClass(record.ret5dVsSpy, record.label)}>{formatPercent(record.ret5dVsSpy)}</td>
                        <td>{formatPercent(record.mfe5d)}</td>
                        <td>{formatPercent(record.mae5d)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>

        ) : (
          <section className="panel wide">
            <div>Coming soon: {activeTab}</div>
          </section>
        )}
      </div>

      {/* ── Persistent help button (B6) ── */}
      <button
        type="button"
        className="help-fab"
        aria-label="說明"
        onClick={() => setShowHelp(v => !v)}
      >
        ?
      </button>

      {/* ── Quick help panel ── */}
      {showHelp && (
        <div className="help-panel" role="dialog" aria-modal="true" aria-label="使用說明">
          <div className="help-panel__inner">
            <button type="button" className="modal-close" onClick={() => setShowHelp(false)}>✕</button>
            <h3>使用說明</h3>
            <dl className="gate-legend__list">
              <dt>ETF Weekly</dt>
              <dd>每週大市 ETF 信號：🟢升勢 / 🔴跌勢 / 🟡中性。配合 Regime 判斷大方向。</dd>
              <dt>Stock Screener</dt>
              <dd>即時個股信號，按梯形排列：WATCH → SETUP → CONFIRM → PROMOTION。</dd>
              <dt>Stock Research</dt>
              <dd>六關卡統計驗證。目前所有 label 仍屬研究階段，未通過 G1–G6 前只作參考。</dd>
              <dt>Stock Replay</dt>
              <dd>每隻股票過去 180 個交易日的信號歷史及 5/10D forward return。</dd>
            </dl>
            <p className="gate-legend__note">⚠️ 本工具僅供研究，非投資建議。最終決定由你負責。</p>
            <button
              type="button"
              className="refresh-button"
              style={{ marginTop: '12px' }}
              onClick={() => { setShowHelp(false); setOnboardingStep(1) }}
            >
              重看入門導覽
            </button>
          </div>
        </div>
      )}

      {/* ── Onboarding modal (B6) ── */}
      {onboardingStep !== null && (
        <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="入門導覽">
          <div className="onboarding-modal">
            <div className="onboarding-steps">
              {[1, 2, 3].map(s => (
                <div key={s} className={`onboarding-dot${onboardingStep === s ? ' onboarding-dot--active' : ''}`} />
              ))}
            </div>

            {onboardingStep === 1 && (
              <>
                <h2>歡迎使用 Global ETF 指揮中心</h2>
                <p>本工具幫助你追蹤大市 ETF 和個股的趨勢信號。</p>
                <p>信號分三個層級：<strong>WATCH（初現跡象）→ SETUP（成形）→ CONFIRM（確認）</strong>，越高層越可信。</p>
              </>
            )}

            {onboardingStep === 2 && (
              <>
                <h2>信號梯形 Signal Ladder</h2>
                <p>🟢 <strong>升勢</strong>：LONG_WATCH → LONG_SETUP → LONG_CONFIRM → UP_PROMOTION</p>
                <p>🔴 <strong>跌勢</strong>：SHORT_WATCH → SHORT_SETUP → SHORT_CONFIRM → DOWN_PROMOTION</p>
                <p>信號需要多日連續確認才會升梯。單日信號不代表可立刻行動。</p>
              </>
            )}

            {onboardingStep === 3 && (
              <>
                <h2>研究階段聲明</h2>
                <p>⚠️ 目前所有信號仍屬<strong>研究階段</strong>，未通過六關卡（G1–G6）統計驗證。</p>
                <p>本工具提供的是<strong>參考資訊</strong>，而非投資建議。最終買賣決定由你自己負責。</p>
                <p>可在 Stock Research tab 查看每個信號的統計表現。</p>
              </>
            )}

            <div className="onboarding-actions">
              {onboardingStep < 3 ? (
                <button type="button" className="refresh-button" onClick={() => setOnboardingStep(s => (s ?? 1) + 1)}>
                  下一步 →
                </button>
              ) : (
                <button
                  type="button"
                  className="refresh-button"
                  onClick={() => {
                    window.localStorage.setItem('onboarding_v1_done', '1')
                    setOnboardingStep(null)
                  }}
                >
                  開始使用 ✓
                </button>
              )}
              <button
                type="button"
                className="onboarding-skip"
                onClick={() => {
                  window.localStorage.setItem('onboarding_v1_done', '1')
                  setOnboardingStep(null)
                }}
              >
                略過
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
