import { useState } from 'react'
import { useApp } from '../../app/providers/AppContext'
import { useIntraday, type TimeFrame } from '../../shared/hooks/useIntraday'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { PriceChart } from '../../shared/components/PriceChart'
import { SignalBadge } from '../../shared/components/SignalBadge'
import { EtfSignalBadge } from '../../shared/components/EtfSignalBadge'
import { getStockMeta } from '../../shared/i18n/stockNames'
import { getStockLogoAsset } from '../../../ui/assetRegistry'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import styles from './DetailView.module.css'

const TIMEFRAMES: { id: TimeFrame; label: string }[] = [
  { id: '1D', label: '今日' },
  { id: '5D', label: '5日' },
  { id: '1M', label: '1月' },
  { id: '3M', label: '3月' },
  { id: '1Y', label: '1年' },
]

const SIGNAL_EXPLANATION: Partial<Record<string, string>> = {
  LONG_BREAK:  '股價剛突破近 20 日高位，成交量放大確認，過去類似形態平均 5 日回報 +1.2%。',
  LONG_VCP:    '量縮整理後放量突破，VCP 形態（Volatility Contraction Pattern），過去類似形態平均 5 日回報 +1.1%。',
  LONG_BOUNCE: '升勢完好，回調至 EMA20 附近後今日反彈確認，過去類似形態平均 5 日回報 +0.9%。',
  LONG_BASE:   '趨勢結構完整，量縮整理中，等待突破或反彈觸發信號，過去 5 日平均持平。',
  WATCH:       '方向初現，動量轉正，列入觀察名單，未到入場條件。',
  NEUTRAL:     '目前無明顯方向，建議觀望。',
  AVOID_CHOP:  '價格上下震盪，無方向，避免操作。',
}

export function DetailView() {
  const { detailTarget, closeDetail, mode } = useApp()
  const snap = useSnapshot()
  const [tf, setTf] = useState<TimeFrame>('1M')
  const chart = useIntraday(detailTarget?.ticker ?? '', tf)

  if (!detailTarget) return null

  const isEtf = !!detailTarget.etfLabel

  const stock: StockSnapshotEntry | undefined =
    snap.status === 'ok'
      ? snap.snapshot.stocks.find(s => s.ticker === detailTarget.ticker)
      : undefined

  const meta = getStockMeta(detailTarget.ticker, stock?.name)
  const logo = getStockLogoAsset(detailTarget.ticker)
  const explanation = stock ? (SIGNAL_EXPLANATION[stock.label] ?? '') : ''

  const displayName = isEtf ? detailTarget.ticker : meta.nameZh
  const displayDesc = isEtf
    ? (detailTarget.etfDescription ?? '')
    : (meta.descriptionZh ?? '')
  const displayPrice = isEtf
    ? (detailTarget.etfPrice ?? null)
    : (stock?.indicators.close ?? null)

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
        <div>
          <div className={styles.nameRow}>
            <span className={styles.nameZh}>{displayName}</span>
            <span className={styles.ticker}>
              {isEtf ? detailTarget.etfCategory : detailTarget.ticker}
            </span>
          </div>
          {displayDesc && <p className={styles.desc}>{displayDesc}</p>}
        </div>
      </div>

      {/* Price + signal */}
      {displayPrice !== null && (
        <div className={styles.priceBlock}>
          <span className={styles.price}>${displayPrice.toFixed(2)}</span>
          {isEtf && detailTarget.etfLabel
            ? <EtfSignalBadge label={detailTarget.etfLabel} showCode={mode === 'pro'} />
            : stock && <SignalBadge label={stock.label} showCode={mode === 'pro'} />
          }
        </div>
      )}

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
          {detailTarget.etfIndicators && (
            <div className={styles.metricsCard}>
              <div className={styles.metricsTitle}>ETF 動量指標</div>
              <div className={styles.metricsGrid}>
                <EtfMetric label="13週回報" value={detailTarget.etfIndicators.return13w} fmt="pct" />
                <EtfMetric label="26週回報" value={detailTarget.etfIndicators.return26w} fmt="pct" />
                <EtfMetric label="相對SPY強弱" value={detailTarget.etfIndicators.relStrengthVsSpy} fmt="pct" />
                <EtfMetric label="距40週均線" value={detailTarget.etfIndicators.priceVs40wMa !== null ? detailTarget.etfIndicators.priceVs40wMa - 1 : null} fmt="pct" />
              </div>
            </div>
          )}
          <div className={styles.explainCard}>
            <div className={styles.explainTitle}>ETF 週度信號</div>
            <p className={styles.explainText}>
              信號基於 13 週回報、40 週均線、相對強弱等因素每週更新。FAVOUR 代表當前動量有利於持有，AVOID 代表動量轉弱建議迴避。
            </p>
            <p className={styles.disclaimer}>研究參考，非買入建議。過去表現不代表將來回報。</p>
          </div>
        </>
      )}

      {/* Signal explanation (stocks only) */}
      {!isEtf && stock && explanation && (
        <div className={styles.explainCard}>
          <div className={styles.explainTitle}>為什麼值得留意？</div>
          <p className={styles.explainText}>{explanation}</p>
          <p className={styles.disclaimer}>研究階段，非買入建議。過去表現不代表將來回報。</p>
        </div>
      )}

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

function EtfMetric({ label, value, fmt }: { label: string; value: number | null; fmt: 'pct' }) {
  if (value === null) {
    return (
      <div className={styles.metric}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={styles.metricValue}>—</span>
      </div>
    )
  }
  const display = fmt === 'pct' ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%` : String(value)
  const color = value > 0 ? 'var(--color-gain)' : value < 0 ? 'var(--color-loss)' : undefined
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue} style={{ color }}>{display}</span>
    </div>
  )
}
