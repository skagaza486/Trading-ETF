import { useState, useMemo } from 'react'
import { useApp } from '../../app/providers/AppContext'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useIntraday, type TimeFrame } from '../../shared/hooks/useIntraday'
import { PriceChart } from '../../shared/components/PriceChart'
import { SignalBadge } from '../../shared/components/SignalBadge'
import type { OHLCVBar } from '../../../types/indicator'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import styles from './IndexDetail.module.css'

// ─── Constants ────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'breadth' | 'holdings' | 'technical' | 'risk' | 'context'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',  label: '總覽' },
  { id: 'breadth',   label: '廣度' },
  { id: 'holdings',  label: '持股' },
  { id: 'technical', label: '技術' },
  { id: 'risk',      label: '風險' },
  { id: 'context',   label: '環境' },
]

const TIMEFRAMES: { id: TimeFrame; label: string }[] = [
  { id: '1M', label: '1月' },
  { id: '3M', label: '3月' },
  { id: '1Y', label: '1年' },
]

const INDEX_DESC: Record<string, string> = {
  '^GSPC': '標普500 代表美國500家大型上市公司，是最廣泛使用的美股市場基準。',
  '^IXIC': 'Nasdaq綜合指數以科技股為主，反映成長型及科技板塊的整體走勢。',
  '^DJI':  '道瓊斯工業平均指數追蹤30隻藍籌股，偏向傳統工業與金融龍頭。',
  '^HSI':  '恆生指數是香港股市的主要基準，涵蓋港交所大型上市公司。',
  '^HSCE': '恆生中國企業指數（H股）反映在港上市中資企業的整體表現。',
}

const REGIME_ZH: Record<string, { label: string; cls: 'bull' | 'bear' | 'neutral' }> = {
  long_friendly:  { label: '偏多', cls: 'bull' },
  short_friendly: { label: '偏弱', cls: 'bear' },
  neutral:        { label: '震盪', cls: 'neutral' },
}

const LIQUIDITY_ZH: Record<string, string> = {
  expanding:   '聯儲流動性擴張',
  flat:        '聯儲流動性持平',
  contracting: '聯儲流動性收縮',
}

// ─── Helper computations ──────────────────────────────────────────────────────

function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null
  const changes = closes.slice(1).map((c, i) => c - closes[i])
  let avgGain = 0, avgLoss = 0
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i]
    else avgLoss += -changes[i]
  }
  avgGain /= period
  avgLoss /= period
  for (let i = period; i < changes.length; i++) {
    const g = changes[i] > 0 ? changes[i] : 0
    const l = changes[i] < 0 ? -changes[i] : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
  }
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}

function computeEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return []
  const k = 2 / (period + 1)
  const ema = [prices[0]]
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k))
  }
  return ema
}

function computeMaxDrawdown(closes: number[]): number {
  let peak = closes[0], maxDD = 0
  for (const c of closes) {
    if (c > peak) peak = c
    const dd = (c - peak) / peak * 100
    if (dd < maxDD) maxDD = dd
  }
  return maxDD
}

function computeAnnualizedVol(closes: number[]): number | null {
  if (closes.length < 5) return null
  const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]))
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance * 252) * 100
}

function computeSharpeCurr(closes: number[], riskFreeAnnual = 0.05): number | null {
  if (closes.length < 5) return null
  const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]))
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
  const std = Math.sqrt(variance)
  if (std === 0) return null
  const rfDaily = riskFreeAnnual / 252
  return ((mean - rfDaily) / std) * Math.sqrt(252)
}

function median(vals: number[]): number | null {
  if (!vals.length) return null
  const sorted = [...vals].sort((a, b) => a - b)
  const m = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m]
}

function fmt(n: number, dp = 2): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: dp })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, unit, cls }: {
  label: string
  value: string
  unit?: string
  cls?: 'gain' | 'loss' | 'warn'
}) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statVal} ${cls ? styles[cls] : ''}`}>
        {value}
        {unit && <span className={styles.statUnit}>{unit}</span>}
      </span>
    </div>
  )
}

function ProgressBar({ label, pct, color = 'gain' }: {
  label: string
  pct: number
  color?: 'gain' | 'loss' | 'warn'
}) {
  return (
    <div className={styles.progressWrap}>
      <div className={styles.progressHeader}>
        <span className={styles.progressLabel}>{label}</span>
        <span className={`${styles.progressPct} ${styles[color]}`}>{pct}%</span>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={`${styles.progressFill} ${styles[`fill_${color}`]}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className={styles.sectionTitle}>{children}</h3>
}

// ─── Tab content ──────────────────────────────────────────────────────────────

function OverviewTab({ bars, snap }: {
  bars: OHLCVBar[]
  snap: { regime: string } | null
}) {
  const latest = bars[bars.length - 1]
  const first = bars[0]
  if (!latest) return <p className={styles.empty}>載入中…</p>

  const pct = first ? (latest.close - first.close) / first.close * 100 : null
  const high = Math.max(...bars.map(b => b.high))
  const low = Math.min(...bars.map(b => b.low))
  const avgVol = bars.reduce((s, b) => s + b.volume, 0) / bars.length
  const regimeCfg = snap ? REGIME_ZH[snap.regime] : null

  return (
    <div className={styles.tabBody}>
      <div className={styles.statsGrid}>
        <StatCard label="最新收市" value={fmt(latest.close)} />
        {pct !== null && (
          <StatCard
            label="期間漲跌"
            value={`${pct >= 0 ? '+' : ''}${fmt(pct)}%`}
            cls={pct >= 0 ? 'gain' : 'loss'}
          />
        )}
        <StatCard label="期間高位" value={fmt(high)} />
        <StatCard label="期間低位" value={fmt(low)} />
        {avgVol > 0 && (
          <StatCard
            label="平均成交量"
            value={avgVol >= 1e9
              ? fmt(avgVol / 1e9, 1)
              : avgVol >= 1e6
                ? fmt(avgVol / 1e6, 1)
                : fmt(avgVol, 0)}
            unit={avgVol >= 1e9 ? 'B' : avgVol >= 1e6 ? 'M' : ''}
          />
        )}
        {regimeCfg && (
          <StatCard
            label="整體市況"
            value={regimeCfg.label}
            cls={regimeCfg.cls === 'bull' ? 'gain' : regimeCfg.cls === 'bear' ? 'loss' : undefined}
          />
        )}
      </div>
      <div className={styles.rangeBar}>
        <span className={styles.rangeLabel}>期間範圍</span>
        <div className={styles.rangeTrack}>
          <div
            className={styles.rangePin}
            style={{
              left: `${((latest.close - low) / (high - low)) * 100}%`,
            }}
          />
        </div>
        <div className={styles.rangeEnds}>
          <span>{fmt(low)}</span>
          <span>{fmt(high)}</span>
        </div>
      </div>
    </div>
  )
}

function BreadthTab({ stocks }: { stocks: StockSnapshotEntry[] }) {
  const stats = useMemo(() => {
    const n = stocks.length
    if (!n) return null
    let above50 = 0, above200 = 0, bullish = 0, bearish = 0, neutral = 0
    const rvolVals: number[] = []
    const rsiVals: number[] = []
    for (const s of stocks) {
      const { close, ema50, ema200, rvol, rsi14 } = s.indicators
      if (ema50 !== null && close > ema50) above50++
      if (ema200 !== null && close > ema200) above200++
      const lbl = s.label
      if (['LONG_BREAK','LONG_VCP','LONG_BOUNCE','LONG_BASE','WATCH'].includes(lbl)) bullish++
      else if (['SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP'].includes(lbl)) bearish++
      else neutral++
      if (rvol !== null) rvolVals.push(rvol)
      if (rsi14 !== null) rsiVals.push(rsi14)
    }
    const pct50 = Math.round(above50 / n * 100)
    const pct200 = Math.round(above200 / n * 100)
    const rvolMed = median(rvolVals)
    const rsiAvg = rsiVals.length ? rsiVals.reduce((a, b) => a + b, 0) / rsiVals.length : null
    const rvolLabel = rvolMed === null ? '—'
      : rvolMed >= 1.5 ? '量能旺盛' : rvolMed >= 1.0 ? '量能正常' : '量能萎縮'
    return { n, above50, above200, pct50, pct200, bullish, bearish, neutral, rvolMed, rvolLabel, rsiAvg }
  }, [stocks])

  if (!stats) return <p className={styles.empty}>無快照資料</p>

  const bullPct = Math.round(stats.bullish / stats.n * 100)
  const bearPct = Math.round(stats.bearish / stats.n * 100)

  return (
    <div className={styles.tabBody}>
      <SectionTitle>價格位置</SectionTitle>
      <div className={styles.card}>
        <ProgressBar
          label={`均線50日以上 (${stats.above50}/${stats.n})`}
          pct={stats.pct50}
          color={stats.pct50 >= 60 ? 'gain' : stats.pct50 >= 40 ? 'warn' : 'loss'}
        />
        <ProgressBar
          label={`均線200日以上 (${stats.above200}/${stats.n})`}
          pct={stats.pct200}
          color={stats.pct200 >= 60 ? 'gain' : stats.pct200 >= 40 ? 'warn' : 'loss'}
        />
      </div>

      <SectionTitle>訊號分佈</SectionTitle>
      <div className={styles.card}>
        <div className={styles.signalCounts}>
          <div className={styles.signalCount}>
            <span className={`${styles.countNum} ${styles.gain}`}>{stats.bullish}</span>
            <span className={styles.countLabel}>偏多訊號</span>
          </div>
          <div className={styles.signalCount}>
            <span className={styles.countNum}>{stats.neutral}</span>
            <span className={styles.countLabel}>中性</span>
          </div>
          <div className={styles.signalCount}>
            <span className={`${styles.countNum} ${styles.loss}`}>{stats.bearish}</span>
            <span className={styles.countLabel}>偏弱訊號</span>
          </div>
        </div>
        <div className={styles.triBar}>
          <div className={styles.triBarBull} style={{ width: `${bullPct}%` }} />
          <div className={styles.triBarNeu} style={{ width: `${Math.round(stats.neutral / stats.n * 100)}%` }} />
          <div className={styles.triBarBear} style={{ width: `${bearPct}%` }} />
        </div>
        <div className={styles.triBarLabels}>
          <span className={styles.gain}>{bullPct}%</span>
          <span className={styles.loss}>{bearPct}%</span>
        </div>
      </div>

      <SectionTitle>量能 / RSI</SectionTitle>
      <div className={styles.statsGrid}>
        <StatCard
          label="RVOL 中位"
          value={stats.rvolMed !== null ? fmt(stats.rvolMed) : '—'}
          unit={stats.rvolMed !== null ? ` ${stats.rvolLabel}` : undefined}
        />
        <StatCard
          label="宇宙平均RSI"
          value={stats.rsiAvg !== null ? fmt(stats.rsiAvg, 0) : '—'}
          cls={stats.rsiAvg !== null ? (stats.rsiAvg >= 60 ? 'gain' : stats.rsiAvg <= 40 ? 'loss' : undefined) : undefined}
        />
      </div>
    </div>
  )
}

function HoldingsTab({ stocks }: { stocks: StockSnapshotEntry[] }) {
  const top = useMemo(() => {
    const PRIORITY: Record<string, number> = {
      LONG_BREAK: 0, LONG_VCP: 1, LONG_BOUNCE: 2, LONG_BASE: 3, WATCH: 4,
    }
    return [...stocks]
      .filter(s => s.label in PRIORITY)
      .sort((a, b) => {
        const pa = PRIORITY[a.label] ?? 99
        const pb = PRIORITY[b.label] ?? 99
        if (pa !== pb) return pa - pb
        return (b.rsRank ?? 0) - (a.rsRank ?? 0)
      })
      .slice(0, 10)
  }, [stocks])

  const sectorCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of stocks) {
      map.set(s.sector, (map.get(s.sector) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [stocks])

  const total = stocks.length || 1

  return (
    <div className={styles.tabBody}>
      <SectionTitle>高強度訊號股 Top 10</SectionTitle>
      <div className={styles.card}>
        {top.length === 0 ? (
          <p className={styles.empty}>目前無偏多訊號</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>代號</th>
                <th className={styles.th}>訊號</th>
                <th className={`${styles.th} ${styles.right}`}>RSRank</th>
                <th className={`${styles.th} ${styles.right}`}>日漲跌</th>
              </tr>
            </thead>
            <tbody>
              {top.map(s => {
                const dayPct = s.prevClose && s.prevClose > 0
                  ? (s.indicators.close - s.prevClose) / s.prevClose * 100
                  : null
                return (
                  <tr key={s.ticker} className={styles.tr}>
                    <td className={styles.td}>
                      <span className={styles.ticker}>{s.ticker}</span>
                      <span className={styles.name}>{s.name}</span>
                    </td>
                    <td className={styles.td}>
                      <SignalBadge label={s.label} />
                    </td>
                    <td className={`${styles.td} ${styles.right}`}>
                      {s.rsRank !== null ? `${Math.round(s.rsRank)}` : '—'}
                    </td>
                    <td className={`${styles.td} ${styles.right}`}>
                      {dayPct !== null ? (
                        <span className={dayPct >= 0 ? styles.gain : styles.loss}>
                          {dayPct >= 0 ? '+' : ''}{fmt(dayPct)}%
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <SectionTitle>板塊分佈</SectionTitle>
      <div className={styles.card}>
        {sectorCounts.map(([sector, count]) => (
          <ProgressBar
            key={sector}
            label={`${sector} (${count})`}
            pct={Math.round(count / total * 100)}
            color="gain"
          />
        ))}
      </div>
    </div>
  )
}

function TechnicalTab({ bars }: { bars: OHLCVBar[] }) {
  const tech = useMemo(() => {
    if (bars.length < 20) return null
    const closes = bars.map(b => b.close)
    const rsi = computeRSI(closes)
    const ema20arr = computeEMA(closes, 20)
    const ema50arr = computeEMA(closes, 50)
    const ema20 = ema20arr[ema20arr.length - 1]
    const ema50 = ema50arr[ema50arr.length - 1]
    const latest = closes[closes.length - 1]

    // Bollinger Bands (20-period)
    const window = closes.slice(-20)
    const mean = window.reduce((a, b) => a + b, 0) / window.length
    const std = Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length)
    const bbUpper = mean + 2 * std
    const bbLower = mean - 2 * std
    const bbPct = std > 0 ? ((latest - bbLower) / (bbUpper - bbLower)) * 100 : 50

    // Support / resistance: recent high/low over last 20 bars
    const recentBars = bars.slice(-20)
    const resistance = Math.max(...recentBars.map(b => b.high))
    const support = Math.min(...recentBars.map(b => b.low))

    // MACD (12/26 EMA)
    const ema12 = computeEMA(closes, 12)
    const ema26 = computeEMA(closes, 26)
    const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1]

    return { rsi, ema20, ema50, latest, bbUpper, bbLower, bbPct, resistance, support, macdLine }
  }, [bars])

  if (!tech) return <p className={styles.empty}>需要更多歷史數據</p>

  const rsiLabel = tech.rsi === null ? '—'
    : tech.rsi >= 70 ? '超買' : tech.rsi <= 30 ? '超賣' : tech.rsi >= 50 ? '偏強' : '偏弱'
  const rsiCls = tech.rsi === null ? undefined
    : tech.rsi >= 70 ? 'warn' as const : tech.rsi <= 30 ? 'loss' as const : tech.rsi >= 50 ? 'gain' as const : undefined

  const macdLabel = tech.macdLine > 0 ? '多頭動能' : '空頭動能'
  const bbLabel = tech.bbPct >= 80 ? '近上軌（偏熱）'
    : tech.bbPct <= 20 ? '近下軌（偏冷）' : '中間區間'

  return (
    <div className={styles.tabBody}>
      <SectionTitle>動量指標</SectionTitle>
      <div className={styles.statsGrid}>
        <StatCard
          label={`RSI14 · ${rsiLabel}`}
          value={tech.rsi !== null ? fmt(tech.rsi, 0) : '—'}
          cls={rsiCls}
        />
        <StatCard
          label={`MACD · ${macdLabel}`}
          value={`${tech.macdLine >= 0 ? '+' : ''}${fmt(tech.macdLine)}`}
          cls={tech.macdLine >= 0 ? 'gain' : 'loss'}
        />
      </div>

      <SectionTitle>均線位置</SectionTitle>
      <div className={styles.card}>
        <div className={styles.emaRow}>
          <span className={styles.emaLabel}>現價</span>
          <span className={styles.emaVal}>{fmt(tech.latest)}</span>
          <span className={tech.latest > tech.ema20 ? styles.gain : styles.loss}>
            {tech.latest > tech.ema20 ? '▲ EMA20以上' : '▼ EMA20以下'}
          </span>
        </div>
        <div className={styles.emaRow}>
          <span className={styles.emaLabel}>EMA20</span>
          <span className={styles.emaVal}>{fmt(tech.ema20)}</span>
        </div>
        {bars.length >= 50 && (
          <div className={styles.emaRow}>
            <span className={styles.emaLabel}>EMA50</span>
            <span className={styles.emaVal}>{fmt(tech.ema50)}</span>
            <span className={tech.latest > tech.ema50 ? styles.gain : styles.loss}>
              {tech.latest > tech.ema50 ? '▲' : '▼'}
            </span>
          </div>
        )}
      </div>

      <SectionTitle>布林帶位置</SectionTitle>
      <div className={styles.card}>
        <div className={styles.bbRow}>
          <span>上軌 {fmt(tech.bbUpper)}</span>
          <span>下軌 {fmt(tech.bbLower)}</span>
        </div>
        <ProgressBar
          label={bbLabel}
          pct={Math.round(Math.max(0, Math.min(100, tech.bbPct)))}
          color={tech.bbPct >= 80 ? 'warn' : tech.bbPct <= 20 ? 'loss' : 'gain'}
        />
      </div>

      <SectionTitle>近期支撐 / 阻力</SectionTitle>
      <div className={styles.statsGrid}>
        <StatCard label="近20日支撐" value={fmt(tech.support)} cls="gain" />
        <StatCard label="近20日阻力" value={fmt(tech.resistance)} cls="loss" />
      </div>
    </div>
  )
}

function RiskTab({ bars }: { bars: OHLCVBar[] }) {
  const risk = useMemo(() => {
    if (bars.length < 5) return null
    const closes = bars.map(b => b.close)
    const latest = closes[closes.length - 1]
    const peak = Math.max(...closes)
    const ddFromPeak = (latest - peak) / peak * 100
    const maxDD = computeMaxDrawdown(closes)
    const annVol = computeAnnualizedVol(closes)
    const sharpe = computeSharpeCurr(closes)
    return { ddFromPeak, maxDD, annVol, sharpe }
  }, [bars])

  if (!risk) return <p className={styles.empty}>需要更多歷史數據</p>

  return (
    <div className={styles.tabBody}>
      <SectionTitle>波幅指標</SectionTitle>
      <div className={styles.statsGrid}>
        <StatCard
          label="年化波幅"
          value={risk.annVol !== null ? `${fmt(risk.annVol, 0)}%` : '—'}
          cls={risk.annVol !== null ? (risk.annVol >= 25 ? 'loss' : risk.annVol <= 12 ? 'gain' : 'warn') : undefined}
        />
        <StatCard
          label="夏普比率"
          value={risk.sharpe !== null ? fmt(risk.sharpe) : '—'}
          cls={risk.sharpe !== null ? (risk.sharpe >= 1 ? 'gain' : risk.sharpe <= 0 ? 'loss' : undefined) : undefined}
        />
      </div>

      <SectionTitle>回撤</SectionTitle>
      <div className={styles.statsGrid}>
        <StatCard
          label="最大回撤"
          value={`${fmt(risk.maxDD)}%`}
          cls="loss"
        />
        <StatCard
          label="距期間高位"
          value={`${fmt(risk.ddFromPeak)}%`}
          cls={risk.ddFromPeak <= -5 ? 'loss' : undefined}
        />
      </div>

      <div className={styles.card}>
        <p className={styles.riskNote}>
          {risk.annVol !== null && risk.annVol >= 25
            ? '⚠ 目前年化波幅偏高，宜縮減倉位或設緊止損。'
            : risk.annVol !== null && risk.annVol <= 12
              ? '✓ 波幅偏低，市場處於相對平靜狀態。'
              : '波幅處於正常範圍，按標準倉位操作。'}
        </p>
        {risk.sharpe !== null && (
          <p className={styles.riskNote}>
            {risk.sharpe >= 1.5
              ? '✓ 夏普比率優秀，風險回報比理想。'
              : risk.sharpe >= 0.5
                ? '夏普比率中等，回報與風險比尚可。'
                : '夏普比率偏低，每單位風險所得回報有限。'}
          </p>
        )}
      </div>
    </div>
  )
}

function ContextTab({
  snap, stocks,
}: {
  snap: { regime: string; proxyWeakBreadth: boolean; liquidityNote?: import('../../../types/snapshot').LiquidityNote } | null
  stocks: StockSnapshotEntry[]
}) {
  const regimeCfg = snap ? REGIME_ZH[snap.regime] : null

  const keySignals = useMemo(() => {
    const n = stocks.length
    if (!n) return []
    let above50 = 0, above200 = 0, bullish = 0, bearish = 0
    for (const s of stocks) {
      const { close, ema50, ema200 } = s.indicators
      if (ema50 !== null && close > ema50) above50++
      if (ema200 !== null && close > ema200) above200++
      if (['LONG_BREAK','LONG_VCP','LONG_BOUNCE','LONG_BASE','WATCH'].includes(s.label)) bullish++
      else if (['SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP'].includes(s.label)) bearish++
    }
    const signals: string[] = []
    const p50 = Math.round(above50 / n * 100)
    const p200 = Math.round(above200 / n * 100)
    if (p50 >= 70) signals.push(`${p50}% 股票在EMA50以上（廣度強）`)
    else if (p50 <= 40) signals.push(`${p50}% 股票在EMA50以上（廣度弱）`)
    if (p200 >= 70) signals.push(`${p200}% 股票在EMA200以上（趨勢健康）`)
    else if (p200 <= 40) signals.push(`${p200}% 股票在EMA200以下（趨勢受損）`)
    if (bullish > bearish * 2) signals.push(`偏多訊號佔優 (${bullish} vs ${bearish})`)
    else if (bearish > bullish * 2) signals.push(`偏弱訊號佔優 (${bearish} vs ${bullish})`)
    return signals
  }, [stocks])

  return (
    <div className={styles.tabBody}>
      <SectionTitle>市場環境</SectionTitle>
      <div className={styles.card}>
        {regimeCfg ? (
          <div className={styles.regimeBlock}>
            <span className={`${styles.regimeBadge} ${styles[`regime_${regimeCfg.cls}`]}`}>
              {regimeCfg.label}
            </span>
            <span className={styles.regimeSub}>{snap?.proxyWeakBreadth ? '（代理廣度偏弱）' : '整體廣度正常'}</span>
          </div>
        ) : (
          <p className={styles.empty}>無快照資料</p>
        )}
      </div>

      {snap?.liquidityNote && (
        <>
          <SectionTitle>聯儲流動性</SectionTitle>
          <div className={styles.card}>
            <div className={styles.liquidityBlock}>
              <span className={`${styles.regimeBadge} ${styles[`regime_${snap.liquidityNote.slope === 'expanding' ? 'bull' : snap.liquidityNote.slope === 'contracting' ? 'bear' : 'neutral'}`]}`}>
                {LIQUIDITY_ZH[snap.liquidityNote.slope]}
              </span>
              <div className={styles.statsGrid} style={{ marginTop: 12 }}>
                <StatCard
                  label="淨流動性"
                  value={`$${fmt(snap.liquidityNote.netLiquidityB, 0)}B`}
                />
                <StatCard
                  label="4週變化"
                  value={`${snap.liquidityNote.change4wB >= 0 ? '+' : ''}$${fmt(snap.liquidityNote.change4wB, 0)}B`}
                  cls={snap.liquidityNote.change4wB >= 0 ? 'gain' : 'loss'}
                />
              </div>
              <p className={styles.riskNote}>截至 {snap.liquidityNote.asOf}</p>
            </div>
          </div>
        </>
      )}

      {keySignals.length > 0 && (
        <>
          <SectionTitle>關鍵訊號</SectionTitle>
          <div className={styles.card}>
            <ul className={styles.signalList}>
              {keySignals.map((sig, i) => (
                <li key={i} className={styles.signalItem}>{sig}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IndexDetail() {
  const { indexTarget, closeIndexDetail } = useApp()
  const [tf, setTf] = useState<TimeFrame>('3M')
  const [tab, setTab] = useState<TabId>('overview')
  const chart = useIntraday(indexTarget?.ticker ?? '', tf)
  const snap = useSnapshot()

  if (!indexTarget) return null

  const bars = chart.status === 'ok' ? chart.bars : []
  const latest = bars[bars.length - 1]
  const first = bars[0]
  const pct = latest && first ? ((latest.close - first.close) / first.close) * 100 : null
  const stocks = snap.status === 'ok' ? snap.snapshot.stocks : []
  const snapData = snap.status === 'ok' ? snap.snapshot : null

  return (
    <div className={styles.view}>
      {/* Header */}
      <div className={styles.topBar}>
        <button className={styles.back} onClick={closeIndexDetail}>← 返回</button>
      </div>

      <div className={styles.titleBlock}>
        <h2 className={styles.title}>{indexTarget.label}</h2>
        <span className={styles.tickerCode}>{indexTarget.ticker}</span>
      </div>

      {latest && (
        <div className={styles.priceBlock}>
          <span className={styles.price}>
            {latest.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          {pct !== null && (
            <span className={pct >= 0 ? styles.gain : styles.loss}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
              <span className={styles.tfHint}>（{TIMEFRAMES.find(t => t.id === tf)?.label}）</span>
            </span>
          )}
        </div>
      )}

      {/* Timeframe selector */}
      <div className={styles.tfRow}>
        {TIMEFRAMES.map(t => (
          <button
            key={t.id}
            className={tf === t.id ? styles.tfActive : styles.tfBtn}
            onClick={() => setTf(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      {chart.status === 'loading' && <div className={styles.chartLoading}>載入圖表中…</div>}
      {chart.status === 'ok' && bars.length > 0 && (
        <PriceChart bars={bars} height={240} showVolume={false} />
      )}

      {/* Index description */}
      {INDEX_DESC[indexTarget.ticker] && (
        <p className={styles.indexDesc}>{INDEX_DESC[indexTarget.ticker]}</p>
      )}

      {/* Tab navigation */}
      <div className={styles.tabsWrap}>
        <div className={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={tab === t.id ? styles.tabActive : styles.tabBtn}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'overview'  && <OverviewTab bars={bars} snap={snapData} />}
      {tab === 'breadth'   && <BreadthTab stocks={stocks} />}
      {tab === 'holdings'  && <HoldingsTab stocks={stocks} />}
      {tab === 'technical' && <TechnicalTab bars={bars} />}
      {tab === 'risk'      && <RiskTab bars={bars} />}
      {tab === 'context'   && <ContextTab snap={snapData} stocks={stocks} />}
    </div>
  )
}
