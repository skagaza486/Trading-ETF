import { useEffect, useMemo, useState } from 'react'
import { etfUniverse } from './data/etfUniverse'
import { stockWatchlist } from './data/watchlist'
import { replayETF } from './engine/etfReplayEngine'
import type { ETFSignalRow } from './engine/etfReplayEngine'
import { buildGateSummaryMarkdown } from './engine/gateSummaryMarkdown'
import { percentChange } from './engine/historyUtils'
import { classifyETF } from './engine/etfWeeklyEngine'
import { classifyRegime, computeProxyWeakBreadth, deriveRegimeInputsFromHistories } from './engine/marketRegime'
import { evaluateAllGates, evaluateRollingWindowRobustness } from './engine/researchGate'
import type { LabelGateResult, LabelRobustnessResult, RollingWindowSummary } from './engine/researchGate'
import { fetchDailySnapshot } from './services/marketData/snapshotProvider'
import { fetchYahooTickerHistory } from './services/marketData/yahooFinanceProvider'
import type { TickerHistory } from './types/indicator'
import type { ETFReplayWeek } from './types/replay'
import type { ForwardReturnRecord } from './types/research'
import type { ETFRecommendation, RegimeClass, ResearchFlag, StockSignalLabel } from './types/signal'
import { getETFLabelDisplay, getResearchFlagDisplay, getStockLabelDisplay } from './ui/labelDisplay'
import { getStockLogoAsset, getUiAsset } from './ui/assetRegistry'
import type { ETFCategory } from './types/etf'
import './styles/dashboard.css'
import './styles/global.css'

type TabId = 'Dashboard' | 'Stocks' | 'ETFs' | 'Quant Lab'
type QuantLabSubTab = 'ETF Replay' | 'Stock Replay' | 'Stock Research'
type StockSortKey = 'signal_strength' | 'rs_rank' | 'recent_change' | 'ticker'
type StockTierFilter = 'ALL' | 'T1' | 'T2'
type EarningsRiskFilter = 'ALL' | 'SAFE' | 'RISK'
type StockLabelGroupFilter = 'ALL' | 'LONG' | 'WATCH' | 'SHORT' | 'NEUTRAL' | 'REVIEW'

type WeeklyRow = {
  ticker: string
  name: string
  category: ETFCategory
  label: ETFRecommendation['label']
  return13w: number | null
  priceVs40wMa: number | null
  rankScore: number | null
  reason: string
}

type WeeklyState = {
  rows: WeeklyRow[]
  replayRows: ReplayRow[]
  histories: Record<string, TickerHistory>
  failedTickers: string[]
  regime: RegimeClass
  proxyWeakBreadth: boolean
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
  tier: 1 | 2
  label: StockSignalLabel
  researchFlags: ResearchFlag[]
  regime: RegimeClass
  earningsDate: string | null
  close: number | null
  dayChange: number | null
  rsi14: number | null
  rvol: number | null
  relStrengthVsSpy: number | null
  reason: string
  rsRank: number | null  // percentile vs universe (from B1 snapshot); null in live-fetch mode
}

type StockState = {
  histories: Record<string, TickerHistory>
  rows: StockRow[]
  failedTickers: string[]
  lastUpdated: string | null
  earningsConfigured: boolean
  regime: RegimeClass
  snapshotDate: string | null  // set when rows loaded from B1 KV snapshot
}

type ResearchState = {
  records: ForwardReturnRecord[]
  lastUpdated: string | null
}

type ETFReplayState = {
  rows: ETFSignalRow[]
  lastUpdated: string | null
}

type HeroMetric = {
  label: string
  value: string
  note: string
  tone: 'gain' | 'info' | 'warn' | 'violet'
}

type SummaryTone = 'gain' | 'info' | 'warn' | 'loss' | 'violet'

type ResearchFlagSummary = {
  flag: ResearchFlag
  count: number
  avgRet5d: number | null
  avgRet5dVsSpy: number | null
  avgMae5d: number | null
}

type StockSectionKey = 'top' | 'review' | 'all' | 'entry' | 'setup' | 'neutral'

const tabs: TabId[] = ['Dashboard', 'Stocks', 'ETFs', 'Quant Lab']
const QUANT_SUBTAB_LABELS: Record<QuantLabSubTab, string> = {
  'ETF Replay': 'ETF Check',
  'Stock Replay': 'Stock Check',
  'Stock Research': 'Signal Proof'
}
const TAB_META: Record<TabId, {
  navLabelEn: string
  navLabelZh: string
  headerTitle: string
  helper: string
  navMark: string
  navIcon: string
}> = {
  Dashboard: {
    navLabelEn: 'Home',
    navLabelZh: '總覽',
    headerTitle: 'Home / 總覽',
    helper: '市場總覽、今日焦點與板塊快覽。',
    navMark: 'H',
    navIcon: 'icon-home'
  },
  Stocks: {
    navLabelEn: 'Stocks',
    navLabelZh: '股票',
    headerTitle: 'Stocks / 股票',
    helper: '即時股票信號與戰術掃描。',
    navMark: 'S',
    navIcon: 'icon-stocks'
  },
  ETFs: {
    navLabelEn: 'ETF',
    navLabelZh: '',
    headerTitle: 'ETF',
    helper: '板塊與 ETF 強弱輪動。',
    navMark: 'E',
    navIcon: 'icon-etf'
  },
  'Quant Lab': {
    navLabelEn: 'Verify',
    navLabelZh: '驗證',
    headerTitle: 'Verify / 驗證',
    helper: '回看、驗證與規則證明。',
    navMark: 'V',
    navIcon: 'icon-verify'
  }
}
const BENCHMARK_TICKERS = ['SPY', 'QQQ', '^VIX', 'RSP']

const CATEGORY_ORDER: ETFCategory[] = [
  'US_EQUITY_CORE', 'SECTOR', 'DIVIDEND', 'HK_CHINA', 'INTL_EQUITY',
  'GOLD', 'COMMODITY', 'REIT', 'HY_BOND', 'US_TREASURY'
]

const CATEGORY_NAMES: Record<ETFCategory, string> = {
  US_TREASURY:    '美國國債 / 債券',
  US_EQUITY_CORE: '美股核心 / 因子',
  HY_BOND:        '高收益債',
  INTL_EQUITY:    '國際股票',
  HK_CHINA:       '港股 / 中國',
  GOLD:           '黃金 / 貴金屬',
  COMMODITY:      '商品',
  REIT:           'REIT 房產',
  SECTOR:         '板塊 ETF',
  DIVIDEND:       '股息 ETF'
}
const REPLAY_WEEKS = 26

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a'
  return `${(value * 100).toFixed(1)}%`
}

function formatRatio(value: number | null): string {
  if (value === null) return 'n/a'
  return value.toFixed(2)
}

function formatSignedNumber(value: number | null): string {
  if (value === null) return 'n/a'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}

function UiIcon({ name, label, className }: { name: string, label?: string, className?: string }) {
  const src = getUiAsset(name)
  if (!src) return null

  return <img src={src} alt={label ?? ''} className={className} aria-hidden={label ? undefined : 'true'} />
}

function StockLogo({ ticker, name, className }: { ticker: string, name: string, className?: string }) {
  const src = getStockLogoAsset(ticker)

  if (!src) {
    return (
      <div className={`stock-logo ${className ?? ''}`.trim()} aria-hidden="true">
        <span>{ticker.slice(0, 4)}</span>
      </div>
    )
  }

  return <img src={src} alt={`${name} logo`} className={`stock-logo ${className ?? ''}`.trim()} loading="lazy" />
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
          category: etf.category,
          label: 'REVIEW' as const,
          return13w: null,
          priceVs40wMa: null,
          rankScore: null,
          reason: 'History fetch failed.'
        }
      }

      const recommendation = classifyETF(history, histories, regime)

      return {
        ticker: etf.ticker,
        name: etf.name,
        category: etf.category,
        label: recommendation.label,
        return13w: recommendation.indicators.return13w,
        priceVs40wMa: recommendation.indicators.priceVs40wMa,
        rankScore: recommendation.indicators.rankScore,
        reason: recommendation.reason
      }
    })
    .sort((left, right) => {
      const pDiff = etfLabelPriority(left.label) - etfLabelPriority(right.label)
      if (pDiff !== 0) return pDiff
      // Within same label, sort by rankScore (risk-adjusted momentum) descending
      const rsDiff = (right.rankScore ?? Number.NEGATIVE_INFINITY) - (left.rankScore ?? Number.NEGATIVE_INFINITY)
      if (rsDiff !== 0) return rsDiff
      return left.ticker.localeCompare(right.ticker)
    })
}

function buildReplayRows(histories: Record<string, TickerHistory>): ReplayRow[] {
  return etfUniverse
    .flatMap(etf => {
      const history = histories[etf.ticker]
      if (!history) return []

      try {
        return replayETF(history, histories, REPLAY_WEEKS).map(week => ({
          ...week,
          name: etf.name
        }))
      } catch {
        return []
      }
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

function buildSparklinePath(history: TickerHistory | undefined, count = 24): { line: string; area: string } | null {
  if (!history) return null

  const closes = history.bars.slice(-count).map(bar => bar.close).filter(close => Number.isFinite(close))
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

function ETFSparkline({ ticker, histories, label }: { ticker: string; histories: Record<string, TickerHistory>; label: ETFRecommendation['label'] }) {
  const history = histories[ticker]
  const sparkline = buildSparklinePath(history, 65)
  if (!sparkline) return null

  const colorKey = label === 'FAVOUR' ? 'long' : label === 'AVOID' ? 'short' : 'neutral'
  return (
    <div className={`etf-card__sparkline etf-card__sparkline--${colorKey}`} aria-hidden="true">
      <svg viewBox="0 0 120 36" preserveAspectRatio="none">
        <path className="etf-card__sparkline-area" d={sparkline.area} />
        <path className="etf-card__sparkline-line" d={sparkline.line} />
      </svg>
    </div>
  )
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


function buildStockRowsFromSnapshot(entries: import('./types/snapshot').StockSnapshotEntry[]): StockRow[] {
  const stockPriority = (label: StockSignalLabel): number => {
    switch (label) {
      case 'LONG_BREAK': return 0
      case 'LONG_VCP': return 1
      case 'LONG_BOUNCE': return 2
      case 'LONG_BASE': return 3
      case 'WATCH': return 4
      case 'SHORT_BREAK': return 5
      case 'SHORT_BASE': return 6
      case 'SHORT_WATCH': return 7
      case 'NEUTRAL': return 8
      case 'AVOID_CHOP': return 9
      case 'REVIEW_EVENT': return 10
      case 'REVIEW_DATA': return 11
    }
  }

  return entries
    .map(entry => ({
      ticker: entry.ticker,
      name: entry.name,
      sector: entry.sector,
      tier: (entry.tier ?? 1) as 1 | 2,
      label: entry.label,
      researchFlags: entry.researchFlags,
      regime: entry.regime,
      earningsDate: null,
      close: entry.indicators.close ?? null,
      dayChange: null,
      rsi14: entry.indicators.rsi14,
      rvol: entry.indicators.rvol,
      relStrengthVsSpy: entry.indicators.relStrengthVsSpy,
      reason: entry.reason,
      rsRank: entry.rsRank
    }))
    .sort((left, right) => {
      const priorityDiff = stockPriority(left.label) - stockPriority(right.label)
      if (priorityDiff !== 0) return priorityDiff
      const tierDiff = left.tier - right.tier  // Tier 1 before Tier 2
      if (tierDiff !== 0) return tierDiff
      const rsDiff = (right.relStrengthVsSpy ?? Number.NEGATIVE_INFINITY) - (left.relStrengthVsSpy ?? Number.NEGATIVE_INFINITY)
      if (rsDiff !== 0) return rsDiff
      return left.ticker.localeCompare(right.ticker)
    })
}

function stockLabelGroup(label: StockSignalLabel): 'LONG' | 'SHORT' | 'NEUTRAL' | 'REVIEW' {
  if (label.startsWith('LONG') || label === 'WATCH') return 'LONG'
  if (label.startsWith('SHORT')) return 'SHORT'
  if (label === 'REVIEW_DATA' || label === 'REVIEW_EVENT') return 'REVIEW'
  return 'NEUTRAL'
}

function stockUiGroup(label: StockSignalLabel): 'STRONG_LONG' | 'LONG' | 'BASE' | 'SHORT' | 'WATCH' | 'REVIEW' {
  switch (label) {
    case 'LONG_BREAK':
    case 'LONG_VCP':
    case 'LONG_BOUNCE':
      return 'STRONG_LONG'
    case 'LONG_BASE':
      return 'BASE'          // universe filter — muted amber, not entry signal
    case 'SHORT_BREAK':
    case 'SHORT_BASE':
    case 'SHORT_WATCH':
      return 'SHORT'
    case 'WATCH':
      return 'WATCH'
    default:
      return 'REVIEW'
  }
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
    case 'LONG_BREAK': return 0
    case 'LONG_VCP': return 1
    case 'LONG_BOUNCE': return 2
    case 'LONG_BASE': return 3
    case 'WATCH': return 4
    case 'SHORT_BREAK': return 5
    case 'SHORT_BASE': return 6
    case 'SHORT_WATCH': return 7
    case 'NEUTRAL': return 8
    case 'AVOID_CHOP': return 9
    case 'REVIEW_EVENT': return 10
    case 'REVIEW_DATA': return 11
  }
}

function stockSignalStrengthPriority(label: StockSignalLabel): number {
  switch (label) {
    case 'LONG_BREAK': return 0
    case 'LONG_VCP': return 1
    case 'LONG_BOUNCE': return 2
    case 'LONG_BASE': return 3
    case 'WATCH': return 4
    case 'SHORT_BREAK': return 5
    case 'SHORT_BASE': return 6
    case 'SHORT_WATCH': return 7
    case 'NEUTRAL': return 8
    case 'AVOID_CHOP': return 9
    case 'REVIEW_EVENT': return 10
    case 'REVIEW_DATA': return 11
  }
}

function latestMetric(history?: TickerHistory | null): { close: number | null, change1d: number | null } {
  if (!history || history.bars.length < 2) return { close: null, change1d: null }
  const latestClose = history.bars.at(-1)?.close ?? null
  const previousClose = history.bars.at(-2)?.close ?? null
  return {
    close: latestClose,
    change1d: latestClose !== null && previousClose !== null ? percentChange(latestClose, previousClose) : null
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

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard API is unavailable.')
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!copied) {
    throw new Error('Clipboard copy failed.')
  }
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

function researchFlagBadgeClass(flag: ResearchFlag): string {
  return `pattern-tag pattern-tag--${flag.toLowerCase().replace(/_/g, '-')}`
}

function renderResearchFlags(flags: ResearchFlag[]) {
  if (flags.length === 0) return null

  return flags.map(flag => {
    const display = getResearchFlagDisplay(flag)
    return (
      <span key={flag} className={researchFlagBadgeClass(flag)} title={display.zhText}>
        {display.shortCode}
      </span>
    )
  })
}

function renderWindowPasses(summary: RollingWindowSummary, passCount: number) {
  if (summary.totalWindows === 0) return 'n/a'
  return `${passCount} / ${summary.totalWindows}`
}

function buildResearchFlagSummary(records: ForwardReturnRecord[]): ResearchFlagSummary[] {
  const flags: ResearchFlag[] = ['BASE_BREAK', 'DISTRIBUTION_WARNING']

  return flags.map(flag => {
    const matching = records.filter(record => record.researchFlags.includes(flag))
    const withRet5d = matching.flatMap(record => record.ret5d === null ? [] : [record.ret5d])
    const withRet5dVsSpy = matching.flatMap(record => record.ret5dVsSpy === null ? [] : [record.ret5dVsSpy])
    const withMae5d = matching.flatMap(record => record.mae5d === null ? [] : [record.mae5d])

    return {
      flag,
      count: matching.length,
      avgRet5d: average(withRet5d),
      avgRet5dVsSpy: average(withRet5dVsSpy),
      avgMae5d: average(withMae5d)
    }
  })
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

function pageIntro(activeTab: TabId, stockState: StockState): { title: string; helper: string; subnote: string } {
  switch (activeTab) {
    case 'Dashboard':
      return {
        title: TAB_META.Dashboard.headerTitle,
        helper: TAB_META.Dashboard.helper,
        subnote: 'Regime · Action Radar · Sector Snapshot'
      }
    case 'ETFs':
      return {
        title: TAB_META.ETFs.headerTitle,
        helper: TAB_META.ETFs.helper,
        subnote: 'Favour · Watch · Avoid'
      }
    case 'Stocks':
      return {
        title: TAB_META.Stocks.headerTitle,
        helper: TAB_META.Stocks.helper,
        subnote: stockState.earningsConfigured
          ? 'Yahoo price history + earnings risk'
          : 'Yahoo price history · earnings risk not configured'
      }
    case 'Quant Lab':
      return {
        title: TAB_META['Quant Lab'].headerTitle,
        helper: TAB_META['Quant Lab'].helper,
        subnote: 'Replay · Validation · Seven Gates'
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
    case 'Dashboard':
      return [
        { label: 'Favour ETFs', value: String(counts.FAVOUR), note: '值得留意', tone: 'gain' },
        { label: 'Active Long', value: String(stockCounts.LONG), note: '今日升勢焦點', tone: 'info' },
        { label: 'Avoid ETFs', value: String(counts.AVOID), note: '走勢偏弱', tone: 'warn' }
      ]
    case 'ETFs':
      return []
    case 'Stocks':
      return [
        { label: 'Active Long', value: String(stockCounts.LONG), note: '今日升勢焦點', tone: 'gain' },
        { label: 'Neutral Flow', value: String(stockCounts.NEUTRAL), note: '等待進一步確認', tone: 'info' },
        { label: 'Earnings Guard', value: earningsConfigured ? 'ON' : 'OFF', note: '財報風險過濾', tone: 'warn' }
      ]
    case 'Quant Lab':
      return [
        { label: 'Records', value: String(researchRecords), note: '研究樣本', tone: 'info' },
        { label: 'Pass Labels', value: String(passedLabels), note: '通過七關卡', tone: 'gain' },
        { label: 'Long Excess 5D', value: formatPercent(longExcess5d), note: '升勢超額回報', tone: 'violet' }
      ]
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('Dashboard')
  const [quantLabSubTab, setQuantLabSubTab] = useState<QuantLabSubTab>('Stock Research')
  const [weeklyState, setWeeklyState] = useState<WeeklyState>({
    rows: [],
    replayRows: [],
    histories: {},
    failedTickers: [],
    regime: 'neutral',
    proxyWeakBreadth: false,
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
    regime: 'neutral',
    snapshotDate: null
  })
  const [isLoadingStocks, setIsLoadingStocks] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)
  const [researchState, setResearchState] = useState<ResearchState>({
    records: [],
    lastUpdated: null
  })
  const [isLoadingResearch, setIsLoadingResearch] = useState(false)
  const [researchError, setResearchError] = useState<string | null>(null)
  const [etfReplayState, setEtfReplayState] = useState<ETFReplayState>({
    rows: [],
    lastUpdated: null
  })
  const [isLoadingETFReplay, setIsLoadingETFReplay] = useState(false)
  const [etfReplayError, setEtfReplayError] = useState<string | null>(null)
  const [selectedStockReplayTicker, setSelectedStockReplayTicker] = useState<string>(stockWatchlist[0]?.ticker ?? '')
  const [showGateLegend, setShowGateLegend] = useState(false)
  const [gateSummaryCopyStatus, setGateSummaryCopyStatus] = useState<string | null>(null)
  const [selectedResearchLabel, setSelectedResearchLabel] = useState<StockSignalLabel | 'ALL'>('ALL')
  const [selectedResearchFlag, setSelectedResearchFlag] = useState<ResearchFlag | 'ALL'>('ALL')
  const [selectedResearchTicker, setSelectedResearchTicker] = useState<string | 'ALL'>('ALL')
  const [stockSortKey, setStockSortKey] = useState<StockSortKey>('signal_strength')
  const [selectedStockTier, setSelectedStockTier] = useState<StockTierFilter>('ALL')
  const [selectedStockSector, setSelectedStockSector] = useState<string>('ALL')
  const [selectedStockLabelGroup, setSelectedStockLabelGroup] = useState<StockLabelGroupFilter>('ALL')
  const [selectedEarningsRisk, setSelectedEarningsRisk] = useState<EarningsRiskFilter>('ALL')
  const [expandedStockTicker, setExpandedStockTicker] = useState<string | null>(null)
  const [etfViewMode, setEtfViewMode] = useState<'table' | 'cards'>('cards')
  const [onboardingStep, setOnboardingStep] = useState<number | null>(() =>
    typeof window !== 'undefined' && window.localStorage.getItem('onboarding_v1_done') ? null : 1
  )
  const [showHelp, setShowHelp] = useState(false)
  const [etfReplayExpanded, setEtfReplayExpanded] = useState(false)
  const [stockReplayExpanded, setStockReplayExpanded] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [expandedEtfCategories, setExpandedEtfCategories] = useState<Set<ETFCategory>>(
    () => new Set(CATEGORY_ORDER)
  )

  function toggleEtfCategory(category: ETFCategory) {
    setExpandedEtfCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) { next.delete(category) } else { next.add(category) }
      return next
    })
  }

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
      const proxyWeakBreadth = computeProxyWeakBreadth(regimeInputs)
      const rows = buildWeeklyRows(histories, regime)
      const replayRows = buildReplayRows(histories)

      setWeeklyState({
        rows,
        replayRows,
        histories,
        failedTickers,
        regime,
        proxyWeakBreadth,
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


  async function loadStockData() {
    setIsLoadingStocks(true)
    setStockError(null)

    try {
      const snapshotResult = await fetchDailySnapshot()

      if (snapshotResult.status === 'ok' && !snapshotResult.stale) {
        const { snapshot } = snapshotResult
        const rows = buildStockRowsFromSnapshot(snapshot.stocks)

        setStockState({
          histories: {},
          rows,
          failedTickers: [],
          lastUpdated: snapshot.generatedAt,
          earningsConfigured: false,
          regime: snapshot.regime,
          snapshotDate: snapshot.date
        })
        setStockError(null)
      } else if (snapshotResult.status === 'ok' && snapshotResult.stale) {
        setStockError('Snapshot is stale (> 25h old). Cron may not have run today.')
      } else {
        setStockError(snapshotResult.status === 'unavailable' ? snapshotResult.reason : 'Unknown snapshot error')
      }
    } catch (error) {
      setStockError(error instanceof Error ? error.message : 'Failed to load snapshot.')
    } finally {
      setIsLoadingStocks(false)
    }
  }

  useEffect(() => {
    if ((activeTab === 'Stocks' || activeTab === 'Dashboard') && stockState.rows.length === 0 && !isLoadingStocks) {
      void loadStockData()
    }
  }, [activeTab, stockState.rows.length, isLoadingStocks])

  async function loadResearchData() {
    setIsLoadingResearch(true)
    setResearchError(null)

    try {
      const response = await fetch('/api/d1/signals?days=365')
      if (!response.ok) {
        throw new Error(`/api/d1/signals returned ${response.status}`)
      }

      const json = (await response.json()) as { records: import('./types/research').ForwardReturnRecord[] }
      const records = json.records.sort((left, right) => {
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
        setResearchError('No research records in D1 yet — cron must run at least once to backfill forward returns.')
      }
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : 'Failed to load research data from D1.')
    } finally {
      setIsLoadingResearch(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'Quant Lab' && researchState.records.length === 0 && !isLoadingResearch) {
      void loadResearchData()
    }
  }, [activeTab, researchState.records.length, isLoadingResearch, stockState.histories])

  async function loadETFReplayData() {
    setIsLoadingETFReplay(true)
    setEtfReplayError(null)
    try {
      const response = await fetch('/api/d1/etf-signals?weeks=52')
      if (!response.ok) throw new Error(`/api/d1/etf-signals returned ${response.status}`)
      const json = (await response.json()) as { rows: ETFSignalRow[] }
      setEtfReplayState({ rows: json.rows, lastUpdated: new Date().toISOString() })
      if (json.rows.length === 0) {
        setEtfReplayError('No ETF signals in D1 yet — run /api/admin/etf-backfill to populate.')
      }
    } catch (error) {
      setEtfReplayError(error instanceof Error ? error.message : 'Failed to load ETF replay data from D1.')
    } finally {
      setIsLoadingETFReplay(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'Quant Lab' && quantLabSubTab === 'ETF Replay' && etfReplayState.rows.length === 0 && !isLoadingETFReplay) {
      void loadETFReplayData()
    }
  }, [activeTab, quantLabSubTab, etfReplayState.rows.length, isLoadingETFReplay])

  useEffect(() => {
    if (gateSummaryCopyStatus === null) return

    const timeoutId = window.setTimeout(() => setGateSummaryCopyStatus(null), 2400)
    return () => window.clearTimeout(timeoutId)
  }, [gateSummaryCopyStatus])

  const counts = labelCounts(weeklyState.rows)
  const replayTickerOptions = ['ALL', ...etfUniverse.map(etf => etf.ticker)]

  // Build ReplayRow[] from D1 ETF signal rows
  const d1ReplayRows: ReplayRow[] = useMemo(() => {
    const etfNameMap = new Map(etfUniverse.map(e => [e.ticker, e.name]))
    return etfReplayState.rows.map(row => ({
      ticker: row.ticker,
      name: etfNameMap.get(row.ticker) ?? row.ticker,
      weekEndingDate: row.weekEndingDate,
      label: row.label,
      indicators: (() => {
        try { return JSON.parse(row.indicatorsJson) } catch { return {} }
      })(),
      ret1w: row.ret1w,
      ret4w: row.ret4w,
    }))
  }, [etfReplayState.rows])

  const filteredReplayRows =
    selectedReplayTicker === 'ALL'
      ? d1ReplayRows
      : d1ReplayRows.filter(row => row.ticker === selectedReplayTicker)
  const replaySummary = buildReplaySummary(filteredReplayRows)
  // Use VOO as the SPY proxy for benchmark comparison (SPY is not in etfUniverse)
  const spyReplayRows: ETFReplayWeek[] = useMemo(() => {
    const benchmarkRows = etfReplayState.rows.filter(r => r.ticker === 'VOO')
    return benchmarkRows.map(r => ({
      ticker: r.ticker,
      weekEndingDate: r.weekEndingDate,
      label: r.label,
      indicators: (() => { try { return JSON.parse(r.indicatorsJson) } catch { return {} } })(),
      ret1w: r.ret1w,
      ret4w: r.ret4w,
    }))
  }, [etfReplayState.rows])
  const replayAnalytics = buildReplayAnalytics(filteredReplayRows, spyReplayRows)
  const stockCounts = countStockGroups(stockState.rows)
  const stockSectorOptions = useMemo(
    () => ['ALL', ...Array.from(new Set(stockState.rows.map(row => row.sector))).sort((left, right) => left.localeCompare(right))],
    [stockState.rows]
  )
  const filteredStockRows = useMemo(() => stockState.rows.filter(row => {
    if (selectedStockTier === 'T1' && row.tier !== 1) return false
    if (selectedStockTier === 'T2' && row.tier !== 2) return false
    if (selectedStockSector !== 'ALL' && row.sector !== selectedStockSector) return false
    if (selectedStockLabelGroup === 'LONG' && !(row.label.startsWith('LONG') && row.label !== 'LONG_BASE')) return false
    if (selectedStockLabelGroup === 'WATCH' && row.label !== 'WATCH' && row.label !== 'LONG_BASE') return false
    if (selectedStockLabelGroup === 'SHORT' && !row.label.startsWith('SHORT')) return false
    if (selectedStockLabelGroup === 'NEUTRAL' && row.label !== 'NEUTRAL' && row.label !== 'AVOID_CHOP') return false
    if (selectedStockLabelGroup === 'REVIEW' && row.label !== 'REVIEW_DATA' && row.label !== 'REVIEW_EVENT') return false
    if (selectedEarningsRisk === 'RISK' && !row.earningsDate) return false
    if (selectedEarningsRisk === 'SAFE' && row.earningsDate) return false
    return true
  }), [stockState.rows, selectedStockTier, selectedStockSector, selectedStockLabelGroup, selectedEarningsRisk])
  const sortedStockRows = useMemo(() => {
    const rows = [...filteredStockRows]
    rows.sort((left, right) => {
      switch (stockSortKey) {
        case 'ticker':
          return left.ticker.localeCompare(right.ticker)
        case 'rs_rank': {
          const rsRankDiff = (right.rsRank ?? Number.NEGATIVE_INFINITY) - (left.rsRank ?? Number.NEGATIVE_INFINITY)
          if (rsRankDiff !== 0) return rsRankDiff
          const rsDiff = (right.relStrengthVsSpy ?? Number.NEGATIVE_INFINITY) - (left.relStrengthVsSpy ?? Number.NEGATIVE_INFINITY)
          if (rsDiff !== 0) return rsDiff
          break
        }
        case 'recent_change': {
          const changeDiff = (right.dayChange ?? Number.NEGATIVE_INFINITY) - (left.dayChange ?? Number.NEGATIVE_INFINITY)
          if (changeDiff !== 0) return changeDiff
          break
        }
        case 'signal_strength':
        default: {
          const priorityDiff = stockSignalStrengthPriority(left.label) - stockSignalStrengthPriority(right.label)
          if (priorityDiff !== 0) return priorityDiff
          break
        }
      }

      const tierDiff = left.tier - right.tier
      if (tierDiff !== 0) return tierDiff
      const rsDiff = (right.relStrengthVsSpy ?? Number.NEGATIVE_INFINITY) - (left.relStrengthVsSpy ?? Number.NEGATIVE_INFINITY)
      if (rsDiff !== 0) return rsDiff
      const rvolDiff = (right.rvol ?? Number.NEGATIVE_INFINITY) - (left.rvol ?? Number.NEGATIVE_INFINITY)
      if (rvolDiff !== 0) return rvolDiff
      return left.ticker.localeCompare(right.ticker)
    })
    return rows
  }, [filteredStockRows, stockSortKey])
  const topSignalRows = useMemo(
    () => sortedStockRows.filter(row => {
      const group = stockLabelGroup(row.label)
      return group === 'LONG' || group === 'SHORT'
    }).slice(0, 12),
    [sortedStockRows]
  )
  const reviewFocusedRows = useMemo(
    () => sortedStockRows.filter(row => stockLabelGroup(row.label) === 'REVIEW').slice(0, 12),
    [sortedStockRows]
  )
  const stockListStats = useMemo(() => ({
    longBias: sortedStockRows.filter(row => stockLabelGroup(row.label) === 'LONG').length,
    shortBias: sortedStockRows.filter(row => stockLabelGroup(row.label) === 'SHORT').length,
    review: sortedStockRows.filter(row => stockLabelGroup(row.label) === 'REVIEW').length
  }), [sortedStockRows])
  const activeStockFilterCount =
    (selectedStockTier !== 'ALL' ? 1 : 0) +
    (selectedStockSector !== 'ALL' ? 1 : 0) +
    (selectedStockLabelGroup !== 'ALL' ? 1 : 0) +
    (selectedEarningsRisk !== 'ALL' ? 1 : 0)
  const stockDirectionalTotal = stockListStats.longBias + stockListStats.shortBias
  const stockLongBiasPercent = stockDirectionalTotal > 0 ? Math.round((stockListStats.longBias / stockDirectionalTotal) * 100) : 0
  const stockShortBiasPercent = stockDirectionalTotal > 0 ? Math.round((stockListStats.shortBias / stockDirectionalTotal) * 100) : 0
  const stocksUpdatedTime = stockState.lastUpdated ? new Date(stockState.lastUpdated).toLocaleTimeString('en-HK', { hour12: false }) : 'pending'
  const stocksUpdatedDate = stockState.snapshotDate
    ?? (stockState.lastUpdated ? new Date(stockState.lastUpdated).toLocaleDateString('en-HK', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Live fetch mode')
  useEffect(() => {
    if (expandedStockTicker === null) return
    const expandedTicker = expandedStockTicker.split(':').at(-1)
    if (!filteredStockRows.some(row => row.ticker === expandedTicker)) {
      setExpandedStockTicker(null)
    }
  }, [expandedStockTicker, filteredStockRows])
  const gateResults = evaluateAllGates(researchState.records)
  const researchDirectional = countDirectionalResearch(researchState.records)
  const intro = pageIntro(activeTab, stockState)
  const isQuantLab = activeTab === 'Quant Lab'
  const activeRegime =
    activeTab === 'Stocks' || activeTab === 'Quant Lab'
      ? stockState.regime
      : weeklyState.regime
  const heroLoadedCount = activeTab === 'Stocks' ? stockState.rows.length : isQuantLab ? researchState.records.length : Object.keys(weeklyState.histories).length
  const heroFailedCount = activeTab === 'Stocks' ? stockState.failedTickers.length : isQuantLab ? 0 : weeklyState.failedTickers.length
  const heroUpdatedAt = activeTab === 'Stocks' ? stockState.lastUpdated : isQuantLab ? researchState.lastUpdated : weeklyState.lastUpdated
  const stockReplayRecords = researchState.records.filter(r => r.ticker === selectedStockReplayTicker)
  const stockReplaySummary = buildStockReplaySummary(stockReplayRecords)
  const passedResearchLabels = gateResults.filter(result => result.status === 'PASS').length
  const researchProblemLabels = gateResults.filter(result => result.status !== 'PASS')
  const researchFlagSummary = buildResearchFlagSummary(researchState.records)
  const robustnessResults = evaluateRollingWindowRobustness(researchState.records)
  const filteredResearchRecords = researchState.records.filter(record => {
    const labelMatches = selectedResearchLabel === 'ALL' || record.label === selectedResearchLabel
    const flagMatches = selectedResearchFlag === 'ALL' || record.researchFlags.includes(selectedResearchFlag)
    const tickerMatches = selectedResearchTicker === 'ALL' || record.ticker === selectedResearchTicker
    return labelMatches && flagMatches && tickerMatches
  })
  const hasActiveResearchFilter =
    selectedResearchLabel !== 'ALL' || selectedResearchFlag !== 'ALL' || selectedResearchTicker !== 'ALL'
  const researchFilterStats = (() => {
    const recs = filteredResearchRecords
    const with5d = recs.filter(r => r.ret5d !== null)
    const avg5d = with5d.length > 0 ? with5d.reduce((s, r) => s + (r.ret5d ?? 0), 0) / with5d.length : null
    const directional5d = with5d.filter(r => stockLabelGroup(r.label as StockSignalLabel) === 'LONG' || stockLabelGroup(r.label as StockSignalLabel) === 'SHORT')
    const wins5d = directional5d.filter(r => stockLabelGroup(r.label as StockSignalLabel) === 'LONG' ? (r.ret5d ?? 0) > 0 : (r.ret5d ?? 0) < 0).length
    const winRate5d = directional5d.length > 0 ? wins5d / directional5d.length : null
    return { n: recs.length, avg5d, winRate5d }
  })()

  function renderStockTerminalRows(rows: StockRow[], sectionKey: StockSectionKey) {
    return rows.map(row => {
      const disp = getStockLabelDisplay(row.label)
      const group = stockLabelGroup(row.label).toLowerCase()
      const uiGroup = stockUiGroup(row.label).toLowerCase()
      const expanded = expandedStockTicker === `${sectionKey}:${row.ticker}`

      return (
        <article
          key={`${sectionKey}:${row.ticker}`}
          className={`stock-terminal-row stock-terminal-row--${group}${expanded ? ' is-expanded' : ''}`}
        >
          <button
            type="button"
            className="stock-terminal-row__main"
            onClick={() => setExpandedStockTicker(current => current === `${sectionKey}:${row.ticker}` ? null : `${sectionKey}:${row.ticker}`)}
          >
            <div className="stock-terminal-row__identity">
              <StockLogo ticker={row.ticker} name={row.name} className="stock-logo--terminal" />
              <div className="stock-terminal-row__copy">
                <div className="stock-terminal-row__tickerline">
                  <strong>{row.ticker}</strong>
                  {row.tier === 2 ? <span className="ticker-cell__tier">防禦</span> : null}
                  <span className={`signal-chip signal-chip--${uiGroup}`}>{disp.enCode}</span>
                </div>
                <div className="stock-terminal-row__name">{row.name}</div>
                <div className="stock-terminal-row__tags">
                  <span>{row.sector}</span>
                  {row.earningsDate ? <span>財報風險</span> : <span>無近財報</span>}
                  {row.rsRank !== null ? <span>RS% {row.rsRank}</span> : null}
                </div>
              </div>
            </div>
            <div className="stock-terminal-row__sparkline">
              <StockSparkline history={stockState.histories[row.ticker]} group={group} />
            </div>
            <div className="stock-terminal-row__signal">
              <span className={`label-pill label-pill--stock label-pill--stock-${uiGroup}`}>
                {disp.zhText}
              </span>
            </div>
            <div className="stock-terminal-row__metrics">
              <strong>{row.close === null ? 'n/a' : row.close.toFixed(2)}</strong>
              <span className={row.dayChange !== null && row.dayChange < 0 ? 'is-loss' : row.dayChange !== null && row.dayChange > 0 ? 'is-gain' : ''}>
                {row.dayChange === null ? 'Snapshot' : formatPercent(row.dayChange)}
              </span>
              <small>RSI {row.rsi14 === null ? 'n/a' : row.rsi14.toFixed(1)} · RVOL {formatRatio(row.rvol)}</small>
            </div>
          </button>
          {expanded ? (
            <div className="stock-terminal-row__drawer">
              <div>
                <h3>Signal Readout</h3>
                <p>{disp.plainReason}</p>
                <p className="subtle">{row.reason}</p>
              </div>
              <div>
                <h3>Metrics</h3>
                <p>Close {row.close === null ? 'n/a' : row.close.toFixed(2)}</p>
                <p>RS vs SPY {formatPercent(row.relStrengthVsSpy)}</p>
                <p>RS Rank {row.rsRank === null ? 'n/a' : row.rsRank}</p>
              </div>
              <div>
                <h3>Flags</h3>
                <div>{renderResearchFlags(row.researchFlags)}</div>
                <p className="subtle">Regime {regimeSummary(row.regime)}</p>
                {row.earningsDate ? <p className="subtle">財報日期 {row.earningsDate}</p> : <p className="subtle">無近財報事件</p>}
              </div>
            </div>
          ) : null}
        </article>
      )
    })
  }

  async function handleCopyGateSummaryMarkdown() {
    if (gateResults.length === 0) {
      setGateSummaryCopyStatus('No gate data to copy yet.')
      return
    }

    try {
      const markdown = buildGateSummaryMarkdown(gateResults, researchState.lastUpdated)
      await copyTextToClipboard(markdown)
      setGateSummaryCopyStatus(`Copied markdown for ${gateResults.length} labels.`)
    } catch (error) {
      setGateSummaryCopyStatus(error instanceof Error ? error.message : 'Failed to copy markdown.')
    }
  }

  // Dashboard Action Radar
  const radarAttack = useMemo(() =>
    stockState.rows.filter(r => r.label === 'LONG_BREAK' || r.label === 'LONG_BOUNCE' || r.label === 'LONG_VCP').slice(0, 3)
  , [stockState.rows])
  const radarDefend = useMemo(() =>
    stockState.rows.filter(r => r.label === 'AVOID_CHOP' || r.label === 'SHORT_BREAK').slice(0, 3)
  , [stockState.rows])
  const sectorFavour = useMemo(() =>
    weeklyState.rows.filter(r => r.label === 'FAVOUR').slice(0, 3)
  , [weeklyState.rows])
  const sectorAvoid = useMemo(() =>
    weeklyState.rows.filter(r => r.label === 'AVOID').slice(-3).reverse()
  , [weeklyState.rows])
  const marketSnapshotItems = useMemo(() => {
    const definitions = [
      { ticker: 'SPY', label: 'S&P 500' },
      { ticker: 'QQQ', label: 'NASDAQ' },
      { ticker: 'RSP', label: 'Equal Weight' },
      { ticker: '^VIX', label: 'VIX' }
    ]
    return definitions.map(item => {
      const metric = latestMetric(weeklyState.histories[item.ticker])
      return {
        ...item,
        ...metric
      }
    })
  }, [weeklyState.histories])
  const breadthPercent = useMemo(() => {
    const directionalTotal = stockCounts.LONG + stockCounts.SHORT
    if (directionalTotal <= 0) return 0
    return Math.round((stockCounts.LONG / directionalTotal) * 100)
  }, [stockCounts])
  const marketStateScore = useMemo(() => {
    const base =
      weeklyState.regime === 'long_friendly'
        ? 68
        : weeklyState.regime === 'short_friendly'
        ? 34
        : 52
    const breadthBoost = Math.round((breadthPercent - 50) * 0.24)
    return Math.max(18, Math.min(92, base + breadthBoost))
  }, [weeklyState.regime, breadthPercent])
  const marketWarnings = useMemo(() => {
    const warnings: Array<{ title: string, note: string, tone: 'warn' | 'info' | 'gain' }> = []
    if (weeklyState.proxyWeakBreadth) {
      warnings.push({
        title: 'High concentration',
        note: 'SPY 領先但 RSP 落後，升勢偏集中。',
        tone: 'warn'
      })
    }
    const vixMetric = latestMetric(weeklyState.histories['^VIX'])
    if ((vixMetric.close ?? 0) >= 20) {
      warnings.push({
        title: 'Volatility elevated',
        note: `VIX ${vixMetric.close?.toFixed(2) ?? 'n/a'}，短線波動加大。`,
        tone: 'warn'
      })
    }
    if ((stockState.failedTickers.length ?? 0) > 0) {
      warnings.push({
        title: 'Data coverage issue',
        note: `${stockState.failedTickers.length} 個 ticker 載入失敗。`,
        tone: 'info'
      })
    }
    if (warnings.length === 0) {
      warnings.push({
        title: 'No major alerts',
        note: '目前未見明顯系統性阻塞。',
        tone: 'gain'
      })
    }
    return warnings.slice(0, 3)
  }, [weeklyState.proxyWeakBreadth, weeklyState.histories, stockState.failedTickers.length])
  const upcomingEvents = useMemo(() => {
    return stockState.rows
      .filter(row => row.earningsDate)
      .sort((left, right) => (left.earningsDate ?? '').localeCompare(right.earningsDate ?? ''))
      .slice(0, 4)
  }, [stockState.rows])
  const desktopRegimeHeadline =
    weeklyState.regime === 'long_friendly'
      ? 'Bullish'
      : weeklyState.regime === 'short_friendly'
      ? 'Defensive'
      : 'Neutral'
  const desktopRegimeSubline =
    weeklyState.regime === 'long_friendly'
      ? '偏多'
      : weeklyState.regime === 'short_friendly'
      ? '偏弱'
      : '觀望'
  const desktopBreadthNote =
    breadthPercent >= 65
      ? 'Above 50D MA'
      : breadthPercent >= 50
      ? 'Participation steady'
      : 'Breadth below neutral'
  const desktopStrengthNote = weeklyState.proxyWeakBreadth ? 'Narrow breadth' : 'Breadth healthy'
  const desktopRiskNote = weeklyState.proxyWeakBreadth ? 'Moderate' : 'Contained'
  const desktopBreadthDisplay = `Long-led ${breadthPercent}%`

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

  const primaryError =
    activeTab === 'Stocks' ? stockError :
      activeTab === 'Quant Lab' ? researchError :
        loadError

  async function handlePrimaryRefresh() {
    if (activeTab === 'Stocks') {
      await loadStockData()
      return
    }

    if (activeTab === 'Quant Lab') {
      await loadResearchData()
      return
    }

    await loadWeeklyData()
    if (activeTab === 'Dashboard' && stockState.rows.length > 0) {
      await loadStockData()
    }
  }

  return (
    <main className="app-shell">
      <div className="workspace">
        <aside className="side-rail">
          <div className="side-rail__brand">
            <UiIcon name="pulse-logo-mark" className="side-rail__brand-mark" />
            <span>Pulse</span>
          </div>
          <nav aria-label="Desktop navigation" className="side-rail__nav">
            {tabs.map(tab => (
              <button
                key={tab}
                type="button"
                className={tab === activeTab ? 'side-rail__nav-item is-active' : 'side-rail__nav-item'}
                onClick={() => setActiveTab(tab)}
              >
                <UiIcon name={TAB_META[tab].navIcon} className="side-rail__nav-icon" />
                <span className="side-rail__nav-copy">
                  <strong>{TAB_META[tab].navLabelEn}</strong>
                  {TAB_META[tab].navLabelZh ? <small>{TAB_META[tab].navLabelZh}</small> : <small>{TAB_META[tab].navLabelEn}</small>}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="content-shell">
          <header className={activeTab === 'Stocks' ? 'app-header app-header--stocks' : 'app-header'}>
            <div className="app-brand">
              <UiIcon name="pulse-logo-mark" className="app-brand__mark-image" />
              <div className="app-brand__copy">
                <span className="app-brand__name">Pulse</span>
                <strong className="app-brand__title">{intro.title}</strong>
              </div>
            </div>
            <div className="app-header__actions">
              <button type="button" className="header-tool" onClick={() => void handlePrimaryRefresh()}>
                <UiIcon name="icon-refresh" className="header-tool__icon" />
                <span>Refresh</span>
              </button>
              <button type="button" className="header-tool" onClick={() => setShowHelp(v => !v)}>
                <UiIcon name="icon-more" className="header-tool__icon" />
                <span>Help</span>
              </button>
            </div>
          </header>

          {activeTab !== 'Dashboard' && activeTab !== 'Stocks' ? (
            <section className={activeTab === 'Quant Lab' ? 'panel summary-strip summary-strip--verify' : 'panel summary-strip'}>
              <div className="summary-strip__intro">
                <div className="summary-strip__copy">
                  <p className="summary-strip__helper">{intro.helper}</p>
                  <p className="summary-strip__subnote">{intro.subnote}</p>
                </div>
              </div>
              <div className="summary-strip__status">
                <span className="status-chip">Regime <strong>{regimeSummary(activeRegime)}</strong></span>
                <span className="status-chip">Loaded <strong>{heroLoadedCount}</strong></span>
                <span className="status-chip">Updated <strong>{heroUpdatedAt ? new Date(heroUpdatedAt).toLocaleString('en-HK', { hour12: false }) : 'pending'}</strong></span>
              </div>
              <div className="summary-strip__metrics">
                {heroMetrics.map(metric => (
                  <article key={metric.label} className={`summary-pill summary-pill--${metric.tone}`}>
                    <span className="summary-pill__label">{metric.label}</span>
                    <strong className="summary-pill__value"><AnimatedMetricValue value={metric.value} /></strong>
                    <span className="summary-pill__note">{metric.note}</span>
                  </article>
                ))}
              </div>
              <p className="summary-strip__disclaimer">研究階段 · 參考工具，非投資建議</p>
              {primaryError ? <div className="warning">{primaryError}</div> : null}
            </section>
          ) : null}

          {/* ── DASHBOARD ── */}
          {activeTab === 'Dashboard' ? (
          <>
            <section className="home-strip">
              <div className="home-strip__head">
                <div className="home-strip__title">
                  <span>Market Snapshot</span>
                  <small>Live terminal overview</small>
                </div>
                <div className="home-strip__meta">
                  <span className="status-chip">Live</span>
                  <span className="status-chip">Updated <strong>{heroUpdatedAt ? new Date(heroUpdatedAt).toLocaleString('en-HK', { hour12: false }) : 'pending'}</strong></span>
                </div>
              </div>
              <div className="home-strip__grid">
                {marketSnapshotItems.map(item => (
                  <article key={item.ticker} className="home-strip__item">
                    <span>{item.label}</span>
                    <strong>{item.close === null ? 'n/a' : item.close.toFixed(2)}</strong>
                    <small className={item.change1d !== null && item.change1d < 0 ? 'is-loss' : item.change1d !== null && item.change1d > 0 ? 'is-gain' : ''}>
                      {item.change1d === null ? 'pending' : `${formatSignedNumber(item.close !== null && item.change1d !== null ? item.close * item.change1d : null)} · ${formatPercent(item.change1d)}`}
                    </small>
                  </article>
                ))}
              </div>
            </section>

            <section className="home-desktop">
              <div className="home-desktop__main">
                <section className="panel home-state-panel">
                  <div className="home-state-panel__gauge">
                    <div className="home-state-panel__ring">
                      <svg viewBox="0 0 120 120" aria-hidden="true">
                        <circle cx="60" cy="60" r="46" className="home-state-panel__ring-track" />
                        <circle
                          cx="60"
                          cy="60"
                          r="46"
                          className="home-state-panel__ring-value"
                          strokeDasharray={`${Math.max(0, Math.min(289, (marketStateScore / 100) * 289))} 289`}
                        />
                      </svg>
                      <div className="home-state-panel__score">
                        <strong>{marketStateScore}</strong>
                        <span>/100</span>
                      </div>
                    </div>
                    <div className="home-state-panel__scorecopy">
                      <h3>Market State / 市場基調</h3>
                      <p>{weeklyState.regime === 'long_friendly' ? 'Bullish / 偏多' : weeklyState.regime === 'short_friendly' ? 'Defensive / 偏弱' : 'Neutral / 觀望'}</p>
                      <small>市場處於{weeklyState.regime === 'long_friendly' ? '穩健上升' : weeklyState.regime === 'short_friendly' ? '防守模式' : '等待確認'}階段。</small>
                    </div>
                  </div>
                  <div className="home-state-panel__readout">
                    <div><span>Trend / 趨勢</span><strong>{weeklyState.regime === 'long_friendly' ? 'Uptrend' : weeklyState.regime === 'short_friendly' ? 'Risk-off' : 'Balanced'}</strong></div>
                    <div><span>Breadth / 廣度</span><strong>{desktopBreadthDisplay}</strong></div>
                    <div><span>Risk / 風險</span><strong>{weeklyState.proxyWeakBreadth ? 'Moderate' : 'Normal'}</strong></div>
                    <div><span>Market vs SPY</span><strong>{stockCounts.LONG > stockCounts.SHORT ? 'Outperform' : 'Mixed'}</strong></div>
                  </div>
                </section>

                <div className="home-lower-grid">
                  <section className="panel">
                    <div className="section-header">
                      <div>
                        <h2>Action Radar / 今日焦點信號</h2>
                        <p className="subtle">最值得即日查看的個股信號。</p>
                      </div>
                    </div>
                    <div className="home-list-block">
                      {radarAttack.concat(radarDefend).slice(0, 6).map(row => {
                        const disp = getStockLabelDisplay(row.label)
                        const group = stockLabelGroup(row.label).toLowerCase()
                        return (
                          <div key={row.ticker} className="home-list-row">
                            <div className="home-list-row__identity">
                              <StockLogo ticker={row.ticker} name={row.name} className="stock-logo--table" />
                              <div>
                                <strong>{row.ticker}</strong>
                                <span>{row.name}</span>
                              </div>
                            </div>
                            <span className={`label-pill label-pill--stock label-pill--stock-${group}`}>{disp.enCode}</span>
                          </div>
                        )
                      })}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="section-header">
                      <div>
                        <h2>ETF Leaders / 板塊領先</h2>
                        <p className="subtle">從 ETF weekly 中快速看強弱輪動。</p>
                      </div>
                    </div>
                    <div className="home-list-block">
                      {[...sectorFavour, ...sectorAvoid].slice(0, 6).map(row => (
                        <div key={row.ticker} className="home-list-row">
                          <div className="home-list-row__identity">
                            <div className="home-etf-badge">{row.ticker.slice(0, 2)}</div>
                            <div>
                              <strong>{row.ticker}</strong>
                              <span>{row.name}</span>
                            </div>
                          </div>
                          <span className={row.label === 'AVOID' ? 'home-list-row__value is-loss' : 'home-list-row__value is-gain'}>
                            {row.rankScore !== null ? row.rankScore.toFixed(0) : formatPercent(row.return13w)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>

              <aside className="home-desktop__rail">
                <section className="panel rail-regime-panel">
                  <div className="section-header">
                    <div>
                      <h2>Regime & Breadth / 市場狀態</h2>
                    </div>
                  </div>
                  <div className="rail-regime-panel__hero">
                    <span className="rail-regime-panel__eyebrow">Market Posture</span>
                    <p className="rail-regime-panel__summary">{desktopRegimeHeadline} market with {desktopBreadthDisplay.toLowerCase()}.</p>
                  </div>
                  <div className="rail-regime-grid">
                    <article className="rail-regime-card rail-regime-card--regime">
                      <span>Regime</span>
                      <div className="rail-regime-card__signal" aria-hidden="true">{weeklyState.regime === 'long_friendly' ? '↗' : weeklyState.regime === 'short_friendly' ? '↘' : '→'}</div>
                      <strong>{desktopRegimeHeadline}</strong>
                      <small>{desktopRegimeSubline}</small>
                    </article>
                    <article className="rail-regime-card rail-regime-card--strength">
                      <span>Regime Strength</span>
                      <strong>{marketStateScore}</strong>
                      <div className="rail-regime-meter" aria-hidden="true">
                        <span style={{ width: `${marketStateScore}%` }} />
                      </div>
                      <small>{desktopStrengthNote}</small>
                    </article>
                    <article className="rail-regime-card rail-regime-card--breadth">
                      <span>Market Breadth</span>
                      <div className="rail-breadth-donut" style={{ ['--breadth']: `${breadthPercent}%` } as React.CSSProperties}>
                        <strong>{breadthPercent}%</strong>
                      </div>
                      <small>{desktopBreadthNote}</small>
                    </article>
                  </div>
                  <div className="rail-regime-panel__footer">
                    <span>Risk {desktopRiskNote}</span>
                    <span>vs SPY {stockCounts.LONG > stockCounts.SHORT ? 'Outperform' : 'Mixed'}</span>
                  </div>
                </section>

                <section className="panel">
                  <div className="section-header">
                    <div>
                      <h2>Market Warnings / 市場警示</h2>
                    </div>
                  </div>
                  <div className="rail-stack">
                    {marketWarnings.map(item => (
                      <div key={item.title} className={`rail-note rail-note--${item.tone}`}>
                        <strong>{item.title}</strong>
                        <span>{item.note}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="panel">
                  <div className="section-header">
                    <div>
                      <h2>Upcoming Events / 即將事件</h2>
                    </div>
                  </div>
                  <div className="rail-stack">
                    {upcomingEvents.length === 0 ? <p className="subtle">No near earnings events loaded.</p> : upcomingEvents.map(row => (
                      <div key={row.ticker} className="rail-note rail-note--info">
                        <strong>{row.ticker} Earnings</strong>
                        <span>{row.earningsDate}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </aside>
            </section>
          </>

        ) : activeTab === 'ETFs' ? (
          <>
            <section className="dashboard-grid dashboard-grid--etf-summary wide">
              <article className={`panel ${summaryToneClass('gain')} summary-card--stat`}>
                <h2>🟢 Favour</h2>
                <strong><AnimatedMetricValue value={String(counts.FAVOUR)} /></strong>
              </article>
              <article className={`panel ${summaryToneClass('warn')} summary-card--stat`}>
                <h2>🟡 Watch</h2>
                <strong><AnimatedMetricValue value={String(counts.WATCH)} /></strong>
              </article>
              <article className={`panel ${summaryToneClass('loss')} summary-card--stat`}>
                <h2>🔴 Avoid</h2>
                <strong><AnimatedMetricValue value={String(counts.AVOID)} /></strong>
              </article>
              <article className={`panel ${summaryToneClass('violet')} summary-card--stat`}>
                <h2>⚫ Review</h2>
                <strong><AnimatedMetricValue value={String(counts.REVIEW)} /></strong>
              </article>
            </section>

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>ETF Weekly</h2>
                  <p className="subtle">
                    Yahoo 日線資料聚合為週線後的第一層 ETF 分類，重點看強弱輪動，而不是預測。
                  </p>
                </div>
                <div className="header-actions">
                  <div className="view-toggle">
                    <button type="button" className={`view-toggle__btn${etfViewMode === 'cards' ? ' view-toggle__btn--active' : ''}`} onClick={() => setEtfViewMode('cards')}>卡片</button>
                    <button type="button" className={`view-toggle__btn${etfViewMode === 'table' ? ' view-toggle__btn--active' : ''}`} onClick={() => setEtfViewMode('table')}>列表</button>
                  </div>
                  <button type="button" className="refresh-button" disabled={isLoadingWeekly} onClick={() => void loadWeeklyData()}>
                    {isLoadingWeekly ? 'Refreshing...' : 'Refresh Live Data'}
                  </button>
                </div>
              </div>

              {etfViewMode === 'cards' ? (
                <div className="etf-accordion">
                  {CATEGORY_ORDER.map(category => {
                    const categoryRows = weeklyState.rows.filter(row => row.category === category)
                    if (categoryRows.length === 0) return null
                    const isOpen = expandedEtfCategories.has(category)
                    const hasFavour = categoryRows.some(row => row.label === 'FAVOUR')
                    const hasWatch = categoryRows.some(row => row.label === 'WATCH')
                    return (
                      <div key={category} className="etf-accordion__group">
                        <button
                          type="button"
                          className={`etf-accordion__header${isOpen ? ' is-open' : ''}`}
                          onClick={() => toggleEtfCategory(category)}
                        >
                          <span className="etf-accordion__title">
                            {CATEGORY_NAMES[category]}
                            <span className="etf-accordion__count">{categoryRows.length}</span>
                          </span>
                          <span className="etf-accordion__signals">
                            {hasFavour && <span className="etf-accordion__tag etf-accordion__tag--favour">FAVOUR</span>}
                            {hasWatch && <span className="etf-accordion__tag etf-accordion__tag--watch">WATCH</span>}
                          </span>
                          <span className="etf-accordion__chevron">{isOpen ? '▲' : '▼'}</span>
                        </button>
                        {isOpen && (
                          <div className="etf-card-grid">
                            {categoryRows.map(row => {
                              const disp = getETFLabelDisplay(row.label)
                              const retPos = row.return13w !== null && row.return13w > 0
                              const retNeg = row.return13w !== null && row.return13w < 0
                              return (
                                <article key={row.ticker} className={`etf-card etf-card--${row.label.toLowerCase()}`}>
                                  <div className="etf-card__top">
                                    <span className={`label-pill label-pill--${row.label.toLowerCase()}`}>
                                      {disp.lightEmoji} {disp.zhText}
                                    </span>
                                    <span className="etf-card__code">{row.label}</span>
                                  </div>
                                  <div>
                                    <div className="etf-card__ticker">{row.ticker}</div>
                                    <div className="etf-card__name">{row.name}</div>
                                  </div>
                                  <div className="etf-card__metrics">
                                    <span className="etf-card__metric">13W <strong className={retPos ? 'ret-pos' : retNeg ? 'ret-neg' : ''}>{formatPercent(row.return13w)}</strong></span>
                                    <span className="etf-card__metric">40W <strong>{formatRatio(row.priceVs40wMa)}</strong></span>
                                    {row.rankScore !== null && <span className="etf-card__metric">RS <strong>{row.rankScore.toFixed(2)}</strong></span>}
                                  </div>
                                  <ETFSparkline ticker={row.ticker} histories={weeklyState.histories} label={row.label} />
                                  <div className="etf-card__reason">{disp.plainReason}</div>
                                </article>
                              )
                            })}
                          </div>
                        )}
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
              )}
            </section>
          </>

        ) : activeTab === 'Quant Lab' ? (
          <>
            <section className="panel wide verify-workbench">
              <div className="section-header">
                <div>
                  <h2>Verify Workbench</h2>
                  <p className="subtle">Overview → diagnose → inspect records. 先看結論，再看問題，最後才下鑽原始資料。</p>
                </div>
                <div className="status-row">
                  <span className="status-chip">Records <strong>{researchState.records.length}</strong></span>
                  <span className="status-chip">Pass Labels <strong>{passedResearchLabels}</strong></span>
                  <span className="status-chip">Problems <strong>{researchProblemLabels.length}</strong></span>
                </div>
              </div>
              <div className="verify-workbench__cards">
                <button
                  type="button"
                  className={`verify-workbench__card${quantLabSubTab === 'Stock Research' ? ' is-active' : ''}`}
                  onClick={() => setQuantLabSubTab('Stock Research')}
                >
                  <span>Signal Proof</span>
                  <strong>Overview First</strong>
                  <small>Gate summary, robustness, top problems, records explorer.</small>
                </button>
                <button
                  type="button"
                  className={`verify-workbench__card${quantLabSubTab === 'Stock Replay' ? ' is-active' : ''}`}
                  onClick={() => setQuantLabSubTab('Stock Replay')}
                >
                  <span>Stock Check</span>
                  <strong>Ticker Replay</strong>
                  <small>單一標的的歷史信號軌跡與 forward returns。</small>
                </button>
                <button
                  type="button"
                  className={`verify-workbench__card${quantLabSubTab === 'ETF Replay' ? ' is-active' : ''}`}
                  onClick={() => setQuantLabSubTab('ETF Replay')}
                >
                  <span>ETF Check</span>
                  <strong>Board Validation</strong>
                  <small>Favour / Avoid replay 與 broad regime 驗證。</small>
                </button>
              </div>
            </section>

            <nav aria-label="Quant Lab sub-tabs" className="segmented-control segmented-control--sub">
              {(['ETF Replay', 'Stock Replay', 'Stock Research'] as QuantLabSubTab[]).map(sub => (
                <button
                  key={sub}
                  type="button"
                  className={sub === quantLabSubTab ? 'segmented-control__button is-active' : 'segmented-control__button'}
                  onClick={() => setQuantLabSubTab(sub)}
                >
                  {QUANT_SUBTAB_LABELS[sub]}
                </button>
              ))}
            </nav>

            {quantLabSubTab === 'ETF Replay' ? (<>
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
                  <button type="button" className="refresh-button" disabled={isLoadingETFReplay} onClick={() => void loadETFReplayData()}>
                    {isLoadingETFReplay ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
              </div>

              {etfReplayError ? (
                <p className="subtle" style={{ color: 'var(--color-warn)' }}>{etfReplayError}</p>
              ) : isLoadingETFReplay ? (
                <p className="subtle">Loading ETF signals from D1…</p>
              ) : null}

              {(() => {
                const collapseLimit = Math.min(5, Math.max(1, filteredReplayRows.length))
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
            </>) : quantLabSubTab === 'Stock Replay' ? (<>
            {/* ── STOCK REPLAY (Quant Lab sub-tab) ── */}
            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>個股信號歷史 Signal History</h2>
                  <p className="subtle">
                    每次歷史信號與其後續表現，方便看同一標的在不同市況下是否真的有 edge。
                  </p>
                  <p className="subtle">綠色代表方向正確；紅色代表方向錯誤。入場假設為 next-bar open。</p>
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
                  <article className={`panel ${summaryToneClass('gain')} summary-card--stat`}>
                    <h2>🟢 Long 升勢 · n = {sum.longCount}</h2>
                    <strong><AnimatedMetricValue value={formatPercent(sum.longWinRate5d)} /></strong>
                    <span>5D 方向勝率 · 10D {formatPercent(sum.longWinRate10d)}</span>
                  </article>
                  <article className={`panel ${summaryToneClass('loss')} summary-card--stat`}>
                    <h2>🔴 Short 跌勢 · n = {sum.shortCount}</h2>
                    <strong><AnimatedMetricValue value={formatPercent(sum.shortWinRate5d)} /></strong>
                    <span>5D 方向勝率 · 10D {formatPercent(sum.shortWinRate10d)}</span>
                  </article>
                  <article className={`panel ${summaryToneClass('info')} summary-card--stat`}>
                    <h2>↑ Long 平均回報</h2>
                    <strong><AnimatedMetricValue value={formatPercent(sum.longAvg5d)} /></strong>
                    <span>5D · 10D {formatPercent(sum.longAvg10d)}</span>
                  </article>
                  <article className={`panel ${summaryToneClass('warn')} summary-card--stat`}>
                    <h2>↓ Short 平均回報</h2>
                    <strong><AnimatedMetricValue value={formatPercent(sum.shortAvg5d)} /></strong>
                    <span>5D · 10D {formatPercent(sum.shortAvg10d)}</span>
                  </article>
                </section>
              )
            })()}

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>歷史記錄 All Signals — {selectedStockReplayTicker}</h2>
                  <p className="subtle">{stockReplayRecords.length} signals in 250-bar replay window</p>
                </div>
              </div>
              {(() => {
                const collapseLimit = Math.min(5, Math.max(1, stockReplayRecords.length))
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
                            <th>Flags</th>
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
                                <td>{renderResearchFlags(record.researchFlags)}</td>
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
            </>) : (<>
            {/* ── STOCK RESEARCH (Quant Lab sub-tab) ── */}
            <section className="panel wide quant-summary-panel">
              <div className="section-header">
                <div>
                  <h2>Signal Proof 信號驗證</h2>
                  <p className="subtle">
                    以最近 250 bars 的 replay records 檢查信號是否通過七關卡，而不是只看單次案例。
                  </p>
                </div>
              </div>
              <div className="status-row">
                <span className="status-chip">Records <strong>{researchState.records.length}</strong></span>
                <span className="status-chip">Long <strong>{researchDirectional.longCount}</strong></span>
                <span className="status-chip">Short <strong>{researchDirectional.shortCount}</strong></span>
                <span className="status-chip">Updated <strong>{researchState.lastUpdated ? new Date(researchState.lastUpdated).toLocaleString('en-HK', { hour12: false }) : 'pending'}</strong></span>
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
                <strong><AnimatedMetricValue value="250" /></strong>
                <span>bars per ticker</span>
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
                  <h2>Top Problems 主要問題</h2>
                  <p className="subtle">先標出未通過或樣本不足的 labels，避免一開始淹沒在完整 gate table 裏。</p>
                </div>
              </div>
              {researchProblemLabels.length === 0 ? (
                <p className="subtle">目前所有 labels 都已通過七關卡。</p>
              ) : (
                <div className="verify-problem-grid">
                  {researchProblemLabels.slice(0, 8).map(item => (
                    <article key={item.label} className={`verify-problem-card verify-problem-card--${item.status.toLowerCase()}`}>
                      <div className="label-cell">
                        <span className={`label-pill label-pill--stock label-pill--stock-${stockLabelGroup(item.label).toLowerCase()}`}>
                          {getStockLabelDisplay(item.label).lightEmoji} {item.label}
                        </span>
                        <span className={`status-badge status-badge--${item.status.toLowerCase()}`}>{item.status}</span>
                      </div>
                      <p>n {item.count} · 5D {formatPercent(item.avgRet5d)} · vs SPY {formatPercent(item.avgRet5dVsSpy)}</p>
                      <small>
                        Failed:
                        {[
                          item.gate1SampleSize ? null : ' G1',
                          item.gate2Direction ? null : ' G2',
                          item.gate3VsSpy ? null : ' G3',
                          item.gate4Consistent ? null : ' G4',
                          item.gate5NeutralRegime ? null : ' G5',
                          item.gate6Mae ? null : ' G6',
                          item.gate7StopLossHitRate ? null : ' G7'
                        ].filter(Boolean).join('') || ' check details'}
                      </small>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>Gate Summary 七關卡驗證</h2>
                  <p className="subtle">G1 n≥100 · G2 方向正確 · G3 跑贏大市 · G4 前後半一致 · G5 中性市仍正確 · G6 MAE&lt;3% · G7 止損命中率&lt;30%</p>
                </div>
                <div className="header-actions">
                  <button type="button" className="refresh-button" disabled={isLoadingResearch || gateResults.length === 0} onClick={() => void handleCopyGateSummaryMarkdown()}>
                    📋 Copy MD
                  </button>
                  <button type="button" onClick={() => setShowGateLegend(v => !v)} style={{ fontSize: '0.82rem' }}>Gate 說明</button>
                  <button type="button" className="refresh-button" disabled={isLoadingResearch} onClick={() => void loadResearchData()}>{isLoadingResearch ? 'Refreshing...' : 'Refresh Research'}</button>
                </div>
              </div>
              {gateSummaryCopyStatus && <p className="subtle">{gateSummaryCopyStatus}</p>}
              {showGateLegend && (
                <div className="gate-legend">
                  <button type="button" className="gate-legend__close" onClick={() => setShowGateLegend(false)}>✕</button>
                  <h3>七關卡說明 Gate Criteria</h3>
                  <dl className="gate-legend__list">
                    <dt>G1 — 樣本量</dt><dd>n ≥ 100。</dd>
                    <dt>G2 — 方向正確</dt><dd>Long label Avg 5D &gt; 0；Short &lt; 0。</dd>
                    <dt>G3 — 跑贏大市</dt><dd>Long Avg 5D vs SPY &gt; +0.5%；Short &lt; −0.5%。</dd>
                    <dt>G4 — 前後半一致</dt><dd>前半後半都方向正確。</dd>
                    <dt>G5 — 中性市仍正確</dt><dd>neutral regime 下仍方向正確，需 ≥ 5 樣本。</dd>
                    <dt>G6 — MAE 受控</dt><dd>5D 最大逆向波動平均 &lt; 3%。</dd>
                    <dt>G7 — 止損命中率</dt><dd>Long 被 2×ATR14 止損比率 &lt; 30%，需 ≥ 10 樣本。</dd>
                  </dl>
                  <p className="gate-legend__note">所有 label 必須通過 G1–G7 才能正式建議。</p>
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Label 信號</th><th>n</th><th>Avg 5D</th><th>Median 5D</th><th>vs SPY</th><th>MAE 5D</th>
                      <th title="n ≥ 100">G1</th><th title="方向正確">G2</th><th title="跑贏大市">G3</th>
                      <th title="前後半一致">G4</th><th title="中性市">G5</th><th title="MAE &lt; 3%">G6</th>
                      <th title="止損命中率">G7</th><th>Status</th>
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
                        <td>{item.count}</td><td>{formatPercent(item.avgRet5d)}</td>
                        <td>{formatPercent(item.medianRet5d)}</td><td>{formatPercent(item.avgRet5dVsSpy)}</td>
                        <td>{formatPercent(item.avgMae5d)}</td>
                        <td className={gateClass(item.gate1SampleSize)}>{gateIcon(item.gate1SampleSize)}</td>
                        <td className={gateClass(item.gate2Direction)}>{gateIcon(item.gate2Direction)}</td>
                        <td className={gateClass(item.gate3VsSpy)}>{gateIcon(item.gate3VsSpy)}</td>
                        <td className={gateClass(item.gate4Consistent)}>{gateIcon(item.gate4Consistent)}</td>
                        <td className={gateClass(item.gate5NeutralRegime)}>{gateIcon(item.gate5NeutralRegime)}</td>
                        <td className={gateClass(item.gate6Mae)}>{gateIcon(item.gate6Mae)}</td>
                        <td className={gateClass(item.gate7StopLossHitRate)} title={item.stopLossHitRate !== null ? `${(item.stopLossHitRate * 100).toFixed(0)}%` : undefined}>{gateIcon(item.gate7StopLossHitRate)}</td>
                        <td><span className={`status-badge status-badge--${item.status.toLowerCase()}`}>{item.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>Research Flags Snapshot 研究旗標快照</h2>
                  <p className="subtle">用同一套 replay records 觀察 `BASE_BREAK` / `DISTRIBUTION_WARNING` 的樣本量與 5D 表現。</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Flag</th>
                      <th>n</th>
                      <th>Avg 5D</th>
                      <th>5D vs SPY</th>
                      <th>MAE 5D</th>
                    </tr>
                  </thead>
                  <tbody>
                    {researchFlagSummary.map(item => (
                      <tr key={item.flag}>
                        <td>{renderResearchFlags([item.flag])}</td>
                        <td>{item.count}</td>
                        <td>{formatPercent(item.avgRet5d)}</td>
                        <td>{formatPercent(item.avgRet5dVsSpy)}</td>
                        <td>{formatPercent(item.avgMae5d)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>Rolling Robustness Walk-forward 穩定性</h2>
                  <p className="subtle">把同一批 records 切成 rolling 6M / 12M / 18M 視窗，觀察各 label 在多少個窗口仍通過 G2 / G3 / G6 與 Full PASS。</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Window</th>
                      <th>G2 Pass</th>
                      <th>G3 Pass</th>
                      <th>G6 Pass</th>
                      <th>Full PASS</th>
                      <th>Avg 5D vs SPY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {robustnessResults.flatMap((item: LabelRobustnessResult) => (
                      item.summaries.map((summary, index) => (
                        <tr key={`${item.label}:${summary.window.id}`}>
                          <td>
                            {index === 0 ? (
                              <span className={`label-pill label-pill--stock label-pill--stock-${stockLabelGroup(item.label).toLowerCase()}`}>
                                {getStockLabelDisplay(item.label).lightEmoji} {item.label}
                              </span>
                            ) : '—'}
                          </td>
                          <td>{summary.window.label}</td>
                          <td>{renderWindowPasses(summary, summary.gate2PassWindows)}</td>
                          <td>{renderWindowPasses(summary, summary.gate3PassWindows)}</td>
                          <td>{renderWindowPasses(summary, summary.gate6PassWindows)}</td>
                          <td>{renderWindowPasses(summary, summary.fullPassWindows)}</td>
                          <td>{formatPercent(summary.avgRet5dVsSpy)}</td>
                        </tr>
                      ))
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>Regime Split 大市環境分拆</h2>
                  <p className="subtle">Avg 5D return by signal label across regimes.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>🟢 long_friendly n</th><th>Avg 5D</th>
                      <th>🟡 neutral n</th><th>Avg 5D</th>
                      <th>🔴 short_friendly n</th><th>Avg 5D</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gateResults.map((item: LabelGateResult) => (
                      <tr key={item.label}>
                        <td><span className={`label-pill label-pill--stock label-pill--stock-${stockLabelGroup(item.label).toLowerCase()}`}>{getStockLabelDisplay(item.label).lightEmoji} {item.label}</span></td>
                        <td>{item.regimeSplit.long_friendly.count}</td><td>{formatPercent(item.regimeSplit.long_friendly.avgRet5d)}</td>
                        <td>{item.regimeSplit.neutral.count}</td><td>{formatPercent(item.regimeSplit.neutral.avgRet5d)}</td>
                        <td>{item.regimeSplit.short_friendly.count}</td><td>{formatPercent(item.regimeSplit.short_friendly.avgRet5d)}</td>
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
                    {!hasActiveResearchFilter
                      ? '請先選擇至少一個條件，再展開 records。'
                      : `${filteredResearchRecords.length} records · Avg 5D ${formatPercent(researchFilterStats.avg5d)} · Win Rate ${formatPercent(researchFilterStats.winRate5d)}`}
                  </p>
                </div>
                <div className="header-actions">
                  <label>
                    Ticker
                    <select value={selectedResearchTicker} onChange={e => setSelectedResearchTicker(e.target.value as string | 'ALL')}>
                      <option value="ALL">ALL — 全部</option>
                      {stockWatchlist.map(stock => (
                        <option key={stock.ticker} value={stock.ticker}>{stock.ticker}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Label 信號
                    <select value={selectedResearchLabel} onChange={e => setSelectedResearchLabel(e.target.value as StockSignalLabel | 'ALL')}>
                      <option value="ALL">ALL — 全部</option>
                      <option value="LONG_BREAK">LONG_BREAK</option>
                      <option value="LONG_VCP">LONG_VCP</option>
                      <option value="LONG_BOUNCE">LONG_BOUNCE</option>
                      <option value="LONG_BASE">LONG_BASE</option>
                      <option value="WATCH">WATCH</option>
                      <option value="SHORT_BREAK">SHORT_BREAK</option>
                      <option value="SHORT_BASE">SHORT_BASE</option>
                      <option value="SHORT_WATCH">SHORT_WATCH</option>
                      <option value="NEUTRAL">NEUTRAL</option>
                      <option value="AVOID_CHOP">AVOID_CHOP</option>
                      <option value="REVIEW_EVENT">REVIEW_EVENT</option>
                      <option value="REVIEW_DATA">REVIEW_DATA</option>
                    </select>
                  </label>
                  <label>
                    Research Flag
                    <select value={selectedResearchFlag} onChange={e => setSelectedResearchFlag(e.target.value as ResearchFlag | 'ALL')}>
                      <option value="ALL">ALL — 全部</option>
                      <option value="BASE_BREAK">BASE_BREAK</option>
                      <option value="DISTRIBUTION_WARNING">DISTRIBUTION_WARNING</option>
                    </select>
                  </label>
                </div>
              </div>
              {!hasActiveResearchFilter ? (
                <div className="verify-empty-state">
                  <strong>Select filters to inspect records</strong>
                  <p>建議先從 `Label`、`Ticker` 或 `Research Flag` 選一個條件，避免 300-stock universe 下首屏過重。</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th><th>Ticker</th><th>Label</th><th>Regime</th><th>Flags</th>
                        <th>5D</th><th>10D</th><th>5D vs SPY</th><th>MFE 5D</th><th>MAE 5D</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResearchRecords.slice(0, 500).map(record => (
                        <tr key={`${record.signalDate}:${record.ticker}:${record.label}`}>
                          <td>{record.signalDate}</td>
                          <td>{record.ticker}</td>
                          <td>
                            <span className={`label-pill label-pill--stock label-pill--stock-${stockLabelGroup(record.label).toLowerCase()}`}>
                              {getStockLabelDisplay(record.label).lightEmoji} {record.label}
                            </span>
                          </td>
                          <td>{record.regimeAtSignal}</td>
                          <td>{renderResearchFlags(record.researchFlags)}</td>
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
              )}
            </section>
            </>)}
          </>

        ) : activeTab === 'Stocks' ? (
          <>
            <section className="stocks-screen">
              <div className="stocks-screen__topbar">
                <div className="stocks-screen__title">
                  <div className="stocks-screen__brandlock">
                    <UiIcon name="pulse-logo-mark" className="stocks-screen__brandmark" />
                    <span>Pulse</span>
                  </div>
                  <h1>Stocks / 股票</h1>
                </div>
                <div className="stocks-screen__actions">
                  <button type="button" className="header-tool header-tool--icon" aria-label="Search">
                    <UiIcon name="icon-search" className="header-tool__icon" />
                  </button>
                  <button type="button" className="header-tool header-tool--icon" aria-label="Refresh" disabled={isLoadingStocks} onClick={() => void loadStockData()}>
                    <UiIcon name="icon-refresh" className="header-tool__icon" />
                  </button>
                  <button type="button" className="header-tool header-tool--icon" aria-label="More actions" onClick={() => setShowHelp(v => !v)}>
                    <UiIcon name="icon-more" className="header-tool__icon" />
                  </button>
                </div>
              </div>

              <div className="stocks-kpi-row">
                <article className="stocks-kpi-card">
                  <div className="stocks-kpi-card__head">
                    <span>Long Bias</span>
                    <strong>{stockLongBiasPercent}%</strong>
                  </div>
                  <div className="stocks-kpi-card__subvalue">{stockListStats.longBias} names</div>
                  <div className="stocks-kpi-meter stocks-kpi-meter--long" aria-hidden="true">
                    <span style={{ width: `${stockLongBiasPercent}%` }} />
                  </div>
                </article>
                <article className="stocks-kpi-card stocks-kpi-card--short">
                  <div className="stocks-kpi-card__head">
                    <span>Short Bias</span>
                    <strong>{stockShortBiasPercent}%</strong>
                  </div>
                  <div className="stocks-kpi-card__subvalue">{stockListStats.shortBias} names</div>
                  <div className="stocks-kpi-meter stocks-kpi-meter--short" aria-hidden="true">
                    <span style={{ width: `${stockShortBiasPercent}%` }} />
                  </div>
                </article>
                <article className="stocks-kpi-card stocks-kpi-card--updated">
                  <div className="stocks-kpi-card__head">
                    <span>Updated</span>
                    <strong>{stocksUpdatedTime}</strong>
                  </div>
                  <div className="stocks-kpi-card__subvalue">{stocksUpdatedDate}</div>
                </article>
              </div>

              <div className="stocks-filter-line">
                <div className="stocks-filter-line__lead">
                  <UiIcon name="icon-filter" className="stocks-filter-line__icon" />
                </div>
                <div className="stocks-filter-line__main">
                  <div className="stocks-filter-line__intro">
                    <div className="stocks-filter-line__copy">
                      <strong>Scan Controls</strong>
                      <span>{activeStockFilterCount === 0 ? 'Universe-wide snapshot' : `${activeStockFilterCount} filters active`}</span>
                    </div>
                    {activeStockFilterCount > 0 ? (
                      <button
                        type="button"
                        className="stocks-filter-line__reset"
                        onClick={() => {
                          setSelectedStockTier('ALL')
                          setSelectedStockSector('ALL')
                          setSelectedStockLabelGroup('ALL')
                          setSelectedEarningsRisk('ALL')
                        }}
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                  <div className="stocks-filter-toolbar">
                    <label>
                      <span>Tier</span>
                      <select value={selectedStockTier} onChange={event => setSelectedStockTier(event.target.value as StockTierFilter)}>
                        <option value="ALL">All Tiers</option>
                        <option value="T1">Growth / Tier 1</option>
                        <option value="T2">Defensive / Tier 2</option>
                      </select>
                    </label>
                    <label>
                      <span>Sector</span>
                      <select value={selectedStockSector} onChange={event => setSelectedStockSector(event.target.value)}>
                        {stockSectorOptions.map(option => (
                          <option key={option} value={option}>{option === 'ALL' ? 'All Sectors' : option}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Label</span>
                      <select value={selectedStockLabelGroup} onChange={event => setSelectedStockLabelGroup(event.target.value as StockLabelGroupFilter)}>
                        <option value="ALL">All Labels</option>
                        <option value="LONG">Long Entry</option>
                        <option value="WATCH">Watch / Base</option>
                        <option value="SHORT">Short Risks</option>
                        <option value="NEUTRAL">Neutral / Chop</option>
                        <option value="REVIEW">Review / Data</option>
                      </select>
                    </label>
                    <label>
                      <span>Earnings</span>
                      <select value={selectedEarningsRisk} onChange={event => setSelectedEarningsRisk(event.target.value as EarningsRiskFilter)}>
                        <option value="ALL">All Names</option>
                        <option value="SAFE">No Near Earnings</option>
                        <option value="RISK">Earnings Risk</option>
                      </select>
                    </label>
                  </div>
                  <div className="stocks-sort-inline">
                    <span>Sort</span>
                    <div className="stocks-sortbar__options">
                      {([
                        ['signal_strength', 'Signal Strength'],
                        ['rs_rank', 'RS Rank'],
                        ['recent_change', 'Recent Change'],
                        ['ticker', 'Ticker']
                      ] as Array<[StockSortKey, string]>).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className={stockSortKey === key ? 'stocks-sortbar__btn is-active' : 'stocks-sortbar__btn'}
                          onClick={() => setStockSortKey(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="stocks-list-head">
                <div>
                  <h2>Live Stock Signals</h2>
                  <p className="subtle">高密度掃描模式，先看最強與最弱，再決定是否展開細節。</p>
                </div>
                <div className="stocks-list-head__meta">
                  <span>{sortedStockRows.length} results</span>
                  <span>{topSignalRows.length} top</span>
                  <span>{reviewFocusedRows.length} review</span>
                  <span>{stockState.earningsConfigured ? 'earnings on' : 'earnings off'}</span>
                </div>
              </div>

              {stockError ? <div className="warning">{stockError}</div> : null}

              {sortedStockRows.length === 0 ? (
                <p className="subtle">No rows matched the current filters.</p>
              ) : (() => {
                const entryRows = sortedStockRows.filter(r => r.label === 'LONG_BREAK' || r.label === 'LONG_VCP' || r.label === 'LONG_BOUNCE' || r.label === 'SHORT_BREAK')
                const setupRows = sortedStockRows.filter(r => r.label === 'LONG_BASE' || r.label === 'WATCH' || r.label === 'SHORT_BASE' || r.label === 'SHORT_WATCH')
                const neutralRows = sortedStockRows.filter(r => r.label === 'NEUTRAL' || r.label === 'AVOID_CHOP')
                const reviewRows = sortedStockRows.filter(r => r.label === 'REVIEW_DATA' || r.label === 'REVIEW_EVENT')
                const CAPS: Record<string, number> = { entry: 6, setup: 8, neutral: 5, review: 5 }
                const toggleSection = (key: string) => setExpandedSections(prev => {
                  const next = new Set(prev)
                  next.has(key) ? next.delete(key) : next.add(key)
                  return next
                })
                const renderSection = (rows: typeof entryRows, key: string, label: string, labelClass: string) => {
                  if (rows.length === 0) return null
                  const cap = CAPS[key] ?? 8
                  const isExpanded = expandedSections.has(key)
                  const displayed = isExpanded ? rows : rows.slice(0, cap)
                  return (
                    <div className="stocks-section">
                      <div className="stocks-section__header">
                        <div className="stocks-section__heading">
                          <span className={`stocks-section__label ${labelClass}`}>{label}</span>
                          <span className="stocks-section__count">{rows.length} names</span>
                        </div>
                        {rows.length > cap ? <span className="stocks-section__hint">Top {cap} first</span> : null}
                      </div>
                      <div className="stocks-terminal">{renderStockTerminalRows(displayed, key as Parameters<typeof renderStockTerminalRows>[1])}</div>
                      {rows.length > cap && (
                        <button className="stocks-section__expand" onClick={() => toggleSection(key)}>
                          {isExpanded ? `▲ 收起 Collapse` : `▼ 展開 +${rows.length - cap} more`}
                        </button>
                      )}
                    </div>
                  )
                }
                return (
                  <>
                    {renderSection(entryRows, 'entry', 'Entry Triggers 入場信號', 'stocks-section__label--entry')}
                    {renderSection(setupRows, 'setup', 'Setups 候選觀察', 'stocks-section__label--setup')}
                    {renderSection(neutralRows, 'neutral', 'Neutral / Chop 中性', 'stocks-section__label--neutral')}
                    {renderSection(reviewRows, 'review', 'Review 待確認', 'stocks-section__label--review')}
                  </>
                )
              })()}
            </section>
          </>

        ) : activeTab === ('Stock Replay' as string) ? (
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
                  <article className={`panel ${summaryToneClass('gain')} summary-card--stat`}>
                    <h2>🟢 Long 升勢 · n = {sum.longCount}</h2>
                    <strong><AnimatedMetricValue value={formatPercent(sum.longWinRate5d)} /></strong>
                    <span>5D 方向勝率 · 10D {formatPercent(sum.longWinRate10d)}</span>
                  </article>
                  <article className={`panel ${summaryToneClass('loss')} summary-card--stat`}>
                    <h2>🔴 Short 跌勢 · n = {sum.shortCount}</h2>
                    <strong><AnimatedMetricValue value={formatPercent(sum.shortWinRate5d)} /></strong>
                    <span>5D 方向勝率 · 10D {formatPercent(sum.shortWinRate10d)}</span>
                  </article>
                  <article className={`panel ${summaryToneClass('info')} summary-card--stat`}>
                    <h2>↑ Long 平均回報</h2>
                    <strong><AnimatedMetricValue value={formatPercent(sum.longAvg5d)} /></strong>
                    <span>5D · 10D {formatPercent(sum.longAvg10d)}</span>
                  </article>
                  <article className={`panel ${summaryToneClass('warn')} summary-card--stat`}>
                    <h2>↓ Short 平均回報</h2>
                    <strong><AnimatedMetricValue value={formatPercent(sum.shortAvg5d)} /></strong>
                    <span>5D · 10D {formatPercent(sum.shortAvg10d)}</span>
                  </article>
                </section>
              )
            })()}

            <section className="panel wide">
              <div className="section-header">
                <div>
                  <h2>歷史記錄 All Signals — {selectedStockReplayTicker}</h2>
                  <p className="subtle">{stockReplayRecords.length} signals in 250-bar replay window</p>
                </div>
              </div>
              {(() => {
                const collapseLimit = Math.min(5, Math.max(1, stockReplayRecords.length))
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
                            <th>Flags</th>
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
                                <td>{renderResearchFlags(record.researchFlags)}</td>
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

        ) : (
          <section className="panel wide">
            <div>Coming soon: {activeTab}</div>
          </section>
        )}
      </div>

      <nav aria-label="Primary navigation" className="bottom-nav">
        {tabs.map(tab => (
          <button
            key={tab}
            type="button"
            className={tab === activeTab ? 'bottom-nav__item is-active' : 'bottom-nav__item'}
            onClick={() => setActiveTab(tab)}
          >
            <span className="bottom-nav__icon" aria-hidden="true">
              <UiIcon name={TAB_META[tab].navIcon} className="bottom-nav__icon-image" />
            </span>
            <span className="bottom-nav__label">
              <span className="bottom-nav__label-en">{TAB_META[tab].navLabelEn}</span>
              {TAB_META[tab].navLabelZh ? <span className="bottom-nav__label-zh">{TAB_META[tab].navLabelZh}</span> : null}
            </span>
          </button>
        ))}
      </nav>

      {/* ── Quick help panel ── */}
      {showHelp && (
        <div className="help-panel" role="dialog" aria-modal="true" aria-label="使用說明">
          <div className="help-panel__inner">
            <button type="button" className="modal-close" onClick={() => setShowHelp(false)}>✕</button>
            <h3>使用說明</h3>
            <dl className="gate-legend__list">
              <dt>Home / 總覽</dt>
              <dd>市場基調一覽：Regime + 廣度警示 + 今日焦點信號 + 板塊快覽。</dd>
              <dt>Stocks / 股票</dt>
              <dd>即時個股信號，按梯形排列：WATCH → SETUP → CONFIRM → PROMOTION。</dd>
              <dt>ETF</dt>
              <dd>每週大市 ETF 信號：🟢升勢 / 🔴跌勢 / 🟡中性。配合 Regime 判斷大方向。</dd>
              <dt>Verify / 驗證</dt>
              <dd>深度研究：ETF Replay 回放 · Stock Replay 個股歷史 · Signal Research 七關卡驗證。</dd>
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
                <h2>歡迎使用 Pulse</h2>
                <p>本工具幫助你追蹤大市 ETF 和個股的趨勢信號。</p>
                <p>信號分三個層級：<strong>WATCH（初現跡象）→ SETUP（成形）→ CONFIRM（確認）</strong>，越高層越可信。</p>
              </>
            )}

            {onboardingStep === 2 && (
              <>
                <h2>信號梯形 Signal Ladder</h2>
                <p>🟢 <strong>升勢</strong>：WATCH → LONG_BASE → LONG_BREAK（或 LONG_VCP / LONG_BOUNCE）</p>
                <p>🔴 <strong>跌勢</strong>：SHORT_WATCH → SHORT_BASE → SHORT_BREAK</p>
                <p>信號需要多日連續確認才會升梯。單日信號不代表可立刻行動。</p>
              </>
            )}

            {onboardingStep === 3 && (
              <>
                <h2>研究階段聲明</h2>
                <p>⚠️ 目前所有信號仍屬<strong>研究階段</strong>，未通過七關卡（G1–G7）統計驗證。</p>
                <p>本工具提供的是<strong>參考資訊</strong>，而非投資建議。最終買賣決定由你自己負責。</p>
                <p>可在 Verify / 驗證 頁查看每個信號的統計表現。</p>
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
      </div>
    </main>
  )
}
