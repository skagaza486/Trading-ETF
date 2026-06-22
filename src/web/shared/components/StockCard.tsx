import { useApp } from '../../app/providers/AppContext'
import { SignalBadge } from './SignalBadge'
import { getStockMeta } from '../i18n/stockNames'
import { getStockLogoAsset } from '../../../ui/assetRegistry'
import { Sparkline } from './Sparkline'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import styles from './StockCard.module.css'

type Props = { stock: StockSnapshotEntry; showMode?: 'simple' | 'pro'; delay?: number }

export function StockCard({ stock, showMode = 'simple', delay = 0 }: Props) {
  const { openDetail } = useApp()
  const meta = getStockMeta(stock.ticker, stock.name)
  const logo = getStockLogoAsset(stock.ticker)
  const close = stock.indicators.close
  const ema50 = stock.indicators.ema50
  const prevClose = stock.prevClose ?? null
  const recentClose = stock.recentClose ?? []
  const sparklineValues = [...recentClose].reverse()
  const dayPct = prevClose && prevClose > 0
    ? ((close - prevClose) / prevClose) * 100
    : null

  const pctFromEma50 = ema50 && ema50 > 0 ? ((close - ema50) / ema50) * 100 : null

  return (
    <button
      className={styles.card}
      style={{ '--card-delay': `${delay}s` } as React.CSSProperties}
      onClick={() => openDetail({ ticker: stock.ticker, name: meta.nameZh })}
    >
      <div className={styles.top}>
        <div className={styles.logoWrap}>
          {logo
            ? <img src={logo} alt={stock.ticker} className={styles.logo} />
            : <div className={styles.logoFallback}>{stock.ticker.slice(0, 2)}</div>
          }
        </div>

        <div className={styles.info}>
          <div className={styles.nameRow}>
            <span className={styles.nameZh}>{meta.nameZh}</span>
            <span className={styles.ticker}>{stock.ticker}</span>
          </div>
          {meta.descriptionZh && (
            <p className={styles.desc}>{meta.descriptionZh}</p>
          )}
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={styles.priceBlock}>
          <div className={styles.priceRow}>
            <span className={styles.price}>${close.toFixed(2)}</span>
            {dayPct !== null && (
              <span className={dayPct >= 0 ? styles.gain : styles.loss}>
                今日 {dayPct >= 0 ? '▲' : '▼'}{Math.abs(dayPct).toFixed(1)}%
              </span>
            )}
            {dayPct === null && pctFromEma50 !== null && (
              <span className={pctFromEma50 >= 0 ? styles.gain : styles.loss}>
                EMA50 {pctFromEma50 >= 0 ? '▲' : '▼'}{Math.abs(pctFromEma50).toFixed(1)}%
              </span>
            )}
          </div>
          {dayPct !== null && pctFromEma50 !== null && (
            <div className={styles.secondaryStat}>
              EMA50 {pctFromEma50 >= 0 ? '▲' : '▼'}{Math.abs(pctFromEma50).toFixed(1)}%
            </div>
          )}
        </div>

        <div className={styles.sideRow}>
          {sparklineValues.length > 1 && (
            <Sparkline values={sparklineValues} width={72} height={24} gain={dayPct !== null ? dayPct >= 0 : undefined} />
          )}
          <div className={styles.badgeRow}>
            {stock.earningsWithinWindow && (
              <span className={styles.earnings} title="財報日在信號窗口內">財報⚡</span>
            )}
            <SignalBadge label={stock.label} showCode={showMode === 'pro'} />
            {stock.rsRank !== null && (
              <span className={styles.rs}>RS {stock.rsRank}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
