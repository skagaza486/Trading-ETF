import { useState, Fragment, useMemo } from 'react'
import { useApp } from '../../app/providers/AppContext'
import { useIntraday, type TimeFrame } from '../../shared/hooks/useIntraday'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useSignalStats } from '../../shared/hooks/useSignalStats'
import { useWatchlist } from '../../shared/hooks/useWatchlist'
import { useFinancialNews } from '../../shared/hooks/useFinancialNews'
import { useEarningsDate } from '../../shared/hooks/useEarningsDate'
import { useTickerHistory } from '../../shared/hooks/useTickerHistory'
import { PriceChart } from '../../shared/components/PriceChart'
import { SignalBadge } from '../../shared/components/SignalBadge'
import { EtfSignalBadge } from '../../shared/components/EtfSignalBadge'
import { getStockMeta } from '../../shared/i18n/stockNames'
import { getStockLogoAsset } from '../../../ui/assetRegistry'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import { buildVerificationNote, buildWatchout, buildWhyNow } from '../../shared/stockNarrative'
import styles from './DetailView.module.css'

const TIMEFRAMES: { id: TimeFrame; label: string }[] = [
  { id: '1D', label: '今日' },
  { id: '5D', label: '5日' },
  { id: '1M', label: '1月' },
  { id: '3M', label: '3月' },
  { id: '1Y', label: '1年' },
]

const LABEL_SHORT_ZH: Record<string, string> = {
  LONG_BREAK:  '突破', LONG_VCP: 'VCP突破', LONG_BOUNCE: 'EMA反彈', LONG_BASE: '整固',
  WATCH: '觀察', NEUTRAL: '中性', AVOID_CHOP: '震盪',
  SHORT_BREAK: '空頭突破', SHORT_BASE: '空頭整固', SHORT_WATCH: '空頭觀察',
}

// 純形態描述（白話），不含任何回報數字。實際統計由 SignalStatsCard 以真實樣本動態顯示。
const SIGNAL_EXPLANATION: Partial<Record<string, string>> = {
  LONG_BREAK:  '股價剛突破近 20 日高位，成交量放大確認突破有效。屬強勢形態，惟突破後常見回抽測試。',
  LONG_VCP:    '經量縮整理（VCP 波動收縮）後放量突破，代表賣壓減退、買方重新主導。',
  LONG_BOUNCE: '升勢結構完好，股價回調至 EMA20 附近後今日反彈，屬順勢回檔後的再啟動。',
  LONG_BASE:   '趨勢結構完整、量縮整理中，尚未出現突破或反彈觸發，屬等待階段。',
  WATCH:       '方向初現、動量轉正，列入觀察名單，但未到入場條件。',
  NEUTRAL:     '目前無明顯方向，建議觀望。',
  AVOID_CHOP:  '價格上下震盪、無清晰方向，宜避免操作。',
}

export function DetailView() {
  const { detailTarget, closeDetail, mode } = useApp()
  const snap = useSnapshot()
  const { starred, toggle } = useWatchlist()
  const [tf, setTf] = useState<TimeFrame>('1M')

  const ticker = detailTarget?.ticker ?? ''
  const isEtf = !!detailTarget?.etfLabel
  const chart = useIntraday(ticker, tf)
  const news = useFinancialNews(!ticker || isEtf ? null : ticker)
  const earnings = useEarningsDate(!ticker || isEtf ? null : ticker)
  const history = useTickerHistory(!ticker || isEtf ? '' : ticker)

  if (!detailTarget) return null

  const stock: StockSnapshotEntry | undefined =
    snap.status === 'ok'
      ? snap.snapshot.stocks.find(s => s.ticker === detailTarget.ticker)
      : undefined

  const meta = getStockMeta(detailTarget.ticker, stock?.name)
  const logo = getStockLogoAsset(detailTarget.ticker)
  const explanation = stock ? (SIGNAL_EXPLANATION[stock.label] ?? '') : ''
  const whyNow = stock ? buildWhyNow(stock) : ''
  const watchout = stock ? buildWatchout(stock) : ''
  const verificationNote = stock ? buildVerificationNote(stock) : ''

  const displayName = isEtf ? detailTarget.ticker : meta.nameZh
  const displayDesc = isEtf
    ? (detailTarget.etfDescription ?? '')
    : (meta.descriptionZh ?? '')
  const displayPrice = isEtf
    ? (detailTarget.etfPrice ?? null)
    : (stock?.indicators.close ?? null)
  const earningsWithin30d = !isEtf && earnings.status === 'ok' && earnings.date
    ? daysUntil(earnings.date) <= 30 && daysUntil(earnings.date) >= 0
    : false

  const etfDayPct = isEtf && detailTarget.etfPrice != null && detailTarget.etfPrevClose != null && detailTarget.etfPrevClose > 0
    ? ((detailTarget.etfPrice - detailTarget.etfPrevClose) / detailTarget.etfPrevClose) * 100
    : null

  const etfChartRisk = useMemo(() => {
    if (!isEtf || chart.status !== 'ok' || chart.bars.length < 10) return null
    const closes = chart.bars.map(b => b.close)
    const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]))
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
    const annVol = Math.sqrt(variance * 252) * 100
    let peak = closes[0], maxDD = 0
    for (const c of closes) {
      if (c > peak) peak = c
      const dd = (c - peak) / peak * 100
      if (dd < maxDD) maxDD = dd
    }
    const periodRet = (closes[closes.length - 1] - closes[0]) / closes[0] * 100
    // RSI14
    let rsi: number | null = null
    if (closes.length >= 15) {
      const changes = closes.slice(1).map((c, i) => c - closes[i])
      let ag = 0, al = 0
      for (let i = 0; i < 14; i++) { ag += changes[i] > 0 ? changes[i] : 0; al += changes[i] < 0 ? -changes[i] : 0 }
      ag /= 14; al /= 14
      for (let i = 14; i < changes.length; i++) {
        ag = (ag * 13 + (changes[i] > 0 ? changes[i] : 0)) / 14
        al = (al * 13 + (changes[i] < 0 ? -changes[i] : 0)) / 14
      }
      rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
    }
    return { annVol, maxDD, periodRet, rsi }
  }, [isEtf, chart])

  return (
    <div className={styles.view}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.back} onClick={closeDetail}>← 返回</button>
        <div className={styles.logoWrap}>
          {logo
            ? <img src={logo} alt={detailTarget.ticker} className={styles.logo} />
            : <div className={styles.logoFallback}>{detailTarget.ticker.slice(0, 2)}</div>
          }
        </div>
        <div className={styles.headerInfo}>
          <div className={styles.nameRow}>
            <span className={styles.nameZh}>{displayName}</span>
            <span className={styles.ticker}>
              {isEtf ? detailTarget.etfCategory : detailTarget.ticker}
            </span>
          </div>
          {displayDesc && <p className={styles.desc}>{displayDesc}</p>}
        </div>
        <button
          className={styles.starBtn}
          onClick={() => toggle(detailTarget.ticker)}
          aria-label={starred.has(detailTarget.ticker) ? '移除自選' : '加入自選'}
        >
          {starred.has(detailTarget.ticker) ? '★' : '☆'}
        </button>
      </div>

      {/* Price + signal */}
      {displayPrice !== null && (
        <div className={styles.priceBlock}>
          <span className={styles.price}>${displayPrice.toFixed(2)}</span>
          {isEtf && detailTarget.etfLabel
            ? <EtfSignalBadge label={detailTarget.etfLabel} showCode={mode === 'pro'} />
            : stock && <SignalBadge label={stock.label} showCode={mode === 'pro'} />
          }
          {earningsWithin30d && earnings.status === 'ok' && earnings.date && (
            <span className={styles.earningsChip}>財報 {earnings.date}</span>
          )}
          {!isEtf && stock?.newsCount7d !== undefined && stock.newsCount7d > 0 && (
            <span className={styles.newsChip}>7日 {stock.newsCount7d} 則新聞</span>
          )}
        </div>
      )}

      {/* Signal change indicator (stocks only) */}
      {!isEtf && stock?.previousLabel && stock.previousLabel !== stock.label && (
        <div className={styles.signalChange}>
          信號更新：{LABEL_SHORT_ZH[stock.previousLabel] ?? stock.previousLabel}
          {' → '}
          {LABEL_SHORT_ZH[stock.label] ?? stock.label}
        </div>
      )}

      {/* Earnings warning */}
      {!isEtf && stock?.earningsWithinWindow && (
        <div className={styles.earningsWarn}>
          ⚡ 財報日在窗口內，信號風險較高，倉位宜輕
        </div>
      )}

      {/* Stage indicator (stocks only) */}
      {!isEtf && stock && <StageIndicator label={stock.label} />}

      {/* Time frame selector */}
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
      <div className={styles.chartWrap}>
        {chart.status === 'loading' && (
          <div className={styles.chartPlaceholder}>載入圖表…</div>
        )}
        {chart.status === 'error' && (
          <div className={styles.chartError}>圖表載入失敗</div>
        )}
        {chart.status === 'ok' && chart.bars.length > 0 && (
          <PriceChart bars={chart.bars} height={260} />
        )}
      </div>

      {/* ETF metrics + notice */}
      {isEtf && (
        <>
          {/* 1D change summary */}
          {etfDayPct !== null && (
            <div className={styles.etfDayRow}>
              <span className={styles.etfDayLabel}>今日</span>
              <span className={etfDayPct >= 0 ? styles.etfDayGain : styles.etfDayLoss}>
                {etfDayPct >= 0 ? '▲' : '▼'}{Math.abs(etfDayPct).toFixed(2)}%
              </span>
            </div>
          )}

          {detailTarget.etfIndicators && (
            <div className={styles.metricsCard}>
              <div className={styles.metricsTitle}>動量指標</div>
              <div className={styles.metricsGrid}>
                <EtfMetric label="13週回報" value={detailTarget.etfIndicators.return13w} fmt="pct" />
                <EtfMetric label="26週回報" value={detailTarget.etfIndicators.return26w} fmt="pct" />
                <EtfMetric label="相對SPY強弱" value={detailTarget.etfIndicators.relStrengthVsSpy} fmt="pct" />
                <EtfMetric label="距40週均線" value={detailTarget.etfIndicators.priceVs40wMa !== null ? detailTarget.etfIndicators.priceVs40wMa - 1 : null} fmt="pct" />
                <EtfMetric label="RS動量方向" value={detailTarget.etfIndicators.rsSlope} fmt="slope" />
                <EtfMetric label="綜合排名" value={detailTarget.etfIndicators.rankScore} fmt="rank" />
              </div>
            </div>
          )}

          {/* Chart-derived risk metrics */}
          {etfChartRisk && (
            <div className={styles.metricsCard}>
              <div className={styles.metricsTitle}>期間技術與風險（{tf === '1D' ? '今日' : tf === '5D' ? '近5日' : tf === '1M' ? '近1月' : tf === '3M' ? '近3月' : '近1年'}）</div>
              <div className={styles.metricsGrid}>
                <EtfMetric label="期間回報" value={etfChartRisk.periodRet / 100} fmt="pct" />
                <EtfMetric label="RSI14" value={etfChartRisk.rsi !== null ? etfChartRisk.rsi / 100 : null} fmt="rsi" />
                <EtfMetric label="年化波幅" value={etfChartRisk.annVol / 100} fmt="pct" />
                <EtfMetric label="最大回撤" value={etfChartRisk.maxDD / 100} fmt="pct" />
              </div>
            </div>
          )}

          <div className={styles.explainCard}>
            <div className={styles.explainTitle}>ETF 週度信號</div>
            <p className={styles.explainText}>
              信號基於 13 週回報、40 週均線、相對強弱及 RS 動量方向每週更新。FAVOUR 代表動量有利於持有；AVOID 代表動量轉弱建議迴避。RS 動量方向（rsSlope）正值代表相對強度持續提升，負值代表強度減退。
            </p>
            <p className={styles.disclaimer}>研究參考，非買入建議。ETF 信號屬規則化觀察結果，並非已證實優勢；過去表現不代表將來回報。</p>
          </div>
        </>
      )}

      {/* Signal explanation (stocks only) */}
      {!isEtf && stock && explanation && (
        <div className={styles.explainCard}>
          <div className={styles.explainTitle}>為什麼值得留意？</div>
          <p className={styles.explainText}>{explanation}</p>
          <p className={styles.disclaimer}>研究階段，非買入建議。現有信號屬研究結果展示，edge 尚未證實；過去表現不代表將來回報。</p>
        </div>
      )}

      {!isEtf && stock && (
        <div className={styles.narrativeGrid}>
          <div className={styles.explainCard}>
            <div className={styles.explainTitle}>今天為何浮上來</div>
            <p className={styles.explainText}>{whyNow}</p>
          </div>
          <div className={styles.explainCard}>
            <div className={styles.explainTitle}>先留意的風險</div>
            <p className={styles.explainText}>{watchout}</p>
          </div>
          <div className={styles.explainCard}>
            <div className={styles.explainTitle}>仍需確認什麼</div>
            <p className={styles.explainText}>{verificationNote}</p>
          </div>
        </div>
      )}

      {!isEtf && <NewsSection news={news} />}

      {/* Historical stats — real settled samples, sample-gated (stocks only) */}
      {!isEtf && stock && <SignalStatsCard label={stock.label} />}

      {/* Per-ticker signal history (stocks only) */}
      {!isEtf && stock && <HistoricalSignalsCard history={history} />}

      {/* Key metrics (stocks only) */}
      {!isEtf && stock && (
        <div className={styles.metricsCard}>
          <div className={styles.metricsTitle}>關鍵數據</div>
          <div className={styles.metricsGrid}>
            <Metric label="EMA50" value={stock.indicators.ema50 ? `$${stock.indicators.ema50.toFixed(1)}` : '—'} />
            <Metric label="EMA200" value={stock.indicators.ema200 ? `$${stock.indicators.ema200.toFixed(1)}` : '—'} />
            <Metric label="RSI(14)" value={stock.indicators.rsi14 ? stock.indicators.rsi14.toFixed(0) : '—'} />
            <Metric label="RS 排名" value={stock.rsRank !== null ? `${stock.rsRank}` : '—'} />
            {mode === 'pro' && (
              <>
                <Metric label="RVOL"       value={stock.indicators.rvol ? stock.indicators.rvol.toFixed(1) : '—'} />
                <Metric label="ATR"        value={stock.indicators.atr  ? `$${stock.indicators.atr.toFixed(2)}` : '—'} />
                <Metric label="EMA上方"    value={stock.indicators.aboveEma200 !== null ? (stock.indicators.aboveEma200 ? '是' : '否') : '—'} />
                <Metric label="近52W高"    value={stock.indicators.nearHigh52w !== null ? (stock.indicators.nearHigh52w ? '是' : '否') : '—'} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Pro: regime & flags (stocks only) */}
      {!isEtf && mode === 'pro' && stock && (
        <div className={styles.proCard}>
          <div className={styles.metricsTitle}>進階資訊</div>
          <div className={styles.proRow}><span>市場環境</span><span>{stock.regime}</span></div>
          <div className={styles.proRow}><span>信號</span><span>{stock.label}</span></div>
          {stock.researchFlags.length > 0 && (
            <div className={styles.proRow}>
              <span>研究標記</span>
              <span>{stock.researchFlags.join(', ')}</span>
            </div>
          )}
          <div className={styles.proRow}><span>分析原因</span><span className={styles.reason}>{stock.reason}</span></div>
        </div>
      )}

      {/* Same sector picks (stocks only) */}
      {!isEtf && stock && snap.status === 'ok' && (
        <SameSectorPicks
          currentTicker={stock.ticker}
          sectorZh={meta.sectorZh}
          allStocks={snap.snapshot.stocks}
        />
      )}
    </div>
  )
}

function daysUntil(isoDate: string): number {
  const now = new Date()
  const target = new Date(`${isoDate}T00:00:00`)
  return Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

function relativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.max(1, Math.floor(deltaMs / 60000))
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

function NewsSection({ news }: { news: ReturnType<typeof useFinancialNews> }) {
  if (news.status !== 'ok' || news.items.length === 0) return null

  return (
    <div className={styles.explainCard}>
      <div className={styles.metricsTitle}>最新新聞（7天）</div>
      <div className={styles.newsList}>
        {news.items.map(item => (
          <a
            key={item.id}
            className={styles.newsRow}
            href={item.url}
            target="_blank"
            rel="noreferrer"
          >
            <strong>{item.headline}</strong>
            <span>{item.source} · {relativeTime(item.datetime)}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  )
}

// 形態歷史統計：用真實已結算樣本（/api/d1/signal-stats）。樣本不足時刻意「不顯示回報數字」。
const MIN_SAMPLE = 20

function fmtStatPct(v: number | null): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

function SignalStatsCard({ label }: { label: string }) {
  const stats = useSignalStats(90)
  if (stats.status !== 'ok') return null

  const stat = stats.stats.find(s => s.label === label)
  const insufficient = !stat || stat.n < MIN_SAMPLE

  return (
    <div className={styles.metricsCard}>
      <div className={styles.metricsTitle}>歷史統計 · 過去 {stats.days} 日（已結算樣本）</div>
      {insufficient ? (
        <p className={styles.explainText} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {stat ? `此形態僅 ${stat.n} 個已結算樣本` : '此形態暫無已結算樣本'}，數量不足以提供可靠統計，
          因此暫不顯示回報數字。
        </p>
      ) : (
        <div className={styles.metricsGrid}>
          <Metric label="樣本數 (n)"     value={`${stat!.n}`} />
          <Metric label="5日平均回報"    value={fmtStatPct(stat!.avgRet5d)} />
          <Metric label="勝率"           value={stat!.winRate !== null ? `${stat!.winRate.toFixed(0)}%` : '—'} />
          <Metric label="相對大盤(5日)"  value={fmtStatPct(stat!.avgVsSpy)} />
          <Metric label="平均最大回撤"   value={fmtStatPct(stat!.avgMae5d)} />
          <Metric label="平均最大升幅"   value={fmtStatPct(stat!.avgMfe5d)} />
        </div>
      )}
      <p className={styles.disclaimer}>
        以上為過去已結算樣本的歷史平均，屬研究統計、非未來預測；edge 尚未證實，樣本不足或市況改變時參考價值有限。
      </p>
    </div>
  )
}

const STAGE_MAP: Record<string, 1 | 2 | 3> = {
  WATCH: 1, NEUTRAL: 1,
  LONG_BASE: 2,
  LONG_BREAK: 3, LONG_VCP: 3, LONG_BOUNCE: 3,
}
const WEAK_LABELS = new Set(['AVOID_CHOP', 'SHORT_BREAK', 'SHORT_BASE', 'SHORT_WATCH'])
const STAGES = ['觀察名單', '等待突破', '入場時機'] as const

function StageIndicator({ label }: { label: string }) {
  if (WEAK_LABELS.has(label)) {
    return (
      <div className={styles.stageNote}>偏弱格局，不宜做多操作</div>
    )
  }
  const active = STAGE_MAP[label] ?? 1
  return (
    <div className={styles.stageBar}>
      <span className={styles.stageLead}>現在哪一步？</span>
      <div className={styles.stageSteps}>
        {STAGES.map((s, i) => (
          <Fragment key={s}>
            {i > 0 && <span className={styles.stageArrow}>›</span>}
            <span className={i + 1 === active ? styles.stageActive : styles.stageItem}>{s}</span>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

function EtfMetric({ label, value, fmt }: { label: string; value: number | null; fmt: 'pct' | 'slope' | 'rank' | 'rsi' }) {
  if (value === null) {
    return (
      <div className={styles.metric}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={styles.metricValue}>—</span>
      </div>
    )
  }
  let display: string
  let color: string | undefined
  if (fmt === 'pct') {
    display = `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
    color = value > 0 ? 'var(--color-gain)' : value < 0 ? 'var(--color-loss)' : undefined
  } else if (fmt === 'slope') {
    display = value > 0.002 ? '↑ 上升' : value < -0.002 ? '↓ 下降' : '→ 持平'
    color = value > 0.002 ? 'var(--color-gain)' : value < -0.002 ? 'var(--color-loss)' : 'var(--text-muted)'
  } else if (fmt === 'rank') {
    display = value.toFixed(1)
    color = value >= 70 ? 'var(--color-gain)' : value <= 30 ? 'var(--color-loss)' : undefined
  } else {
    // rsi: value passed as /100 fraction
    const rsiVal = value * 100
    display = rsiVal.toFixed(0)
    color = rsiVal >= 70 ? 'var(--color-warn)' : rsiVal <= 30 ? 'var(--color-loss)' : undefined
  }
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue} style={{ color }}>{display}</span>
    </div>
  )
}

const HISTORY_LABEL_ZH: Record<string, string> = {
  LONG_BREAK: '突破', LONG_VCP: 'VCP', LONG_BOUNCE: '反彈', LONG_BASE: '整固',
  WATCH: '觀察', NEUTRAL: '中性', AVOID_CHOP: '震盪',
  SHORT_BREAK: '空頭突破', SHORT_BASE: '空頭整固', SHORT_WATCH: '空頭轉弱',
}

function HistoricalSignalsCard({ history }: { history: ReturnType<typeof useTickerHistory> }) {
  if (history.status !== 'ok') return null
  const rows = history.rows.slice(0, 8)
  if (rows.length < 3) return null

  return (
    <div className={styles.metricsCard}>
      <div className={styles.metricsTitle}>歷史信號記錄（90天）</div>
      <table className={styles.historyTable}>
        <thead>
          <tr>
            <th>日期</th>
            <th>信號</th>
            <th>5日回報</th>
            <th>vs大盤</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const retColor = row.ret5d === null ? 'var(--text-muted)' : row.ret5d >= 0 ? 'var(--color-gain)' : 'var(--color-loss)'
            const spyColor = row.ret5dVsSpy === null ? 'var(--text-muted)' : row.ret5dVsSpy >= 0 ? 'var(--color-gain)' : 'var(--color-loss)'
            return (
              <tr key={row.signalDate}>
                <td>{row.signalDate.slice(5)}</td>
                <td>{HISTORY_LABEL_ZH[row.label] ?? row.label}</td>
                <td style={{ color: retColor }}>
                  {row.ret5d === null ? '待結算' : `${row.ret5d >= 0 ? '+' : ''}${row.ret5d.toFixed(1)}%`}
                </td>
                <td style={{ color: spyColor }}>
                  {row.ret5dVsSpy === null ? '—' : `${row.ret5dVsSpy >= 0 ? '+' : ''}${row.ret5dVsSpy.toFixed(1)}%`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className={styles.disclaimer}>以已結算樣本為準，近期資料尚未結算顯示「待結算」；歷史記錄只供研究參考，唔代表可重複優勢已被證實。</p>
    </div>
  )
}

const BULL_LABELS_SET = new Set(['LONG_BREAK','LONG_VCP','LONG_BOUNCE','LONG_BASE'])

function SameSectorPicks({
  currentTicker,
  sectorZh,
  allStocks,
}: {
  currentTicker: string
  sectorZh: string
  allStocks: StockSnapshotEntry[]
}) {
  const { openDetail } = useApp()

  const peers = allStocks
    .filter(s => {
      const m = getStockMeta(s.ticker, s.name)
      return s.ticker !== currentTicker && m.sectorZh === sectorZh && BULL_LABELS_SET.has(s.label)
    })
    .sort((a, b) => (b.rsRank ?? 0) - (a.rsRank ?? 0))
    .slice(0, 3)

  if (!peers.length) return null

  return (
    <div className={styles.proCard}>
      <div className={styles.metricsTitle}>同板塊看漲股（{sectorZh}）</div>
      {peers.map(s => {
        const m = getStockMeta(s.ticker, s.name)
        return (
          <button
            key={s.ticker}
            className={styles.peerRow}
            onClick={() => openDetail({ ticker: s.ticker, name: m.nameZh })}
          >
            <div className={styles.peerLeft}>
              <span className={styles.peerTicker}>{s.ticker}</span>
              <span className={styles.peerName}>{m.nameZh}</span>
            </div>
            <div className={styles.peerRight}>
              {s.rsRank !== null && <span className={styles.rs}>RS {s.rsRank}</span>}
              <SignalBadge label={s.label} />
            </div>
          </button>
        )
      })}
    </div>
  )
}
