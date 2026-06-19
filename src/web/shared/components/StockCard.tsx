import { useApp } from '../../app/providers/AppContext'
import { SignalBadge } from './SignalBadge'
import { getStockMeta } from '../i18n/stockNames'
import { getStockLogoAsset } from '../../../ui/assetRegistry'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import styles from './StockCard.module.css'

type Props = { stock: StockSnapshotEntry; showMode?: 'simple' | 'pro' }

export function StockCard({ stock, showMode = 'simple' }: Props) {
  const { openDetail } = useApp()
  const meta = getStockMeta(stock.ticker, stock.name)
  const logo = getStockLogoAsset(stock.ticker)
  const close = stock.indicators.close
  const ema50  = stock.indicators.ema50

  const pctFromEma50 = ema50 && ema50 > 0 ? ((close - ema50) / ema50) * 100 : null

  return (
    <button
      className={styles.card}
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
        <div className={styles.priceRow}>
          <span className={styles.price}>${close.toFixed(2)}</span>
          {pctFromEma50 !== null && (
            <span className={pctFromEma50 >= 0 ? styles.gain : styles.loss}>
              EMA50 {pctFromEma50 >= 0 ? '+' : ''}{pctFromEma50.toFixed(1)}%
            </span>
          )}
        </div>

        <div className={styles.badgeRow}>
          <SignalBadge label={stock.label} showCode={showMode === 'pro'} />
          {stock.rsRank !== null && showMode === 'pro' && (
            <span className={styles.rs}>RS {stock.rsRank}</span>
          )}
        </div>
      </div>
    </button>
  )
}
