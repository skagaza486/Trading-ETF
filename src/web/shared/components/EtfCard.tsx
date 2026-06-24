import { useApp } from '../../app/providers/AppContext'
import { EtfSignalBadge } from './EtfSignalBadge'
import { Sparkline } from './Sparkline'
import { getStockLogoAsset } from '../../../ui/assetRegistry'
import { useEtfMeta } from '../hooks/useEtfMeta'
import type { EtfSignalEntry } from '../hooks/useEtfSignals'
import styles from './StockCard.module.css'

const ETF_CATEGORY_ZH: Record<string, string> = {
  US_TREASURY:    '美國國債',
  HY_BOND:        '高收益債',
  US_EQUITY_CORE: '美股寬基',
  SECTOR:         '行業板塊',
  INTL_EQUITY:    '環球股票',
  HK_CHINA:       '港股/中國',
  REIT:           '房地產',
  COMMODITY:      '大宗商品',
  GOLD:           '黃金',
  DIVIDEND:       '股息收益',
}

type Props = { etf: EtfSignalEntry }

export function EtfCard({ etf }: Props) {
  const { openDetail } = useApp()
  const { etfMetaByTicker } = useEtfMeta()
  const meta = etfMetaByTicker.get(etf.ticker)
  const logo = getStockLogoAsset(etf.ticker)
  const nameDisplay = meta?.name ?? etf.ticker
  const desc = meta?.description ?? ''
  const categoryZh = meta ? (ETF_CATEGORY_ZH[meta.category] ?? meta.category) : 'ETF'
  const price = etf.closeAtSignal
  const dayPct = price !== null && etf.prevClose && etf.prevClose > 0
    ? ((price - etf.prevClose) / etf.prevClose) * 100
    : null
  const sparklineValues = [...etf.recentClose].reverse()

  return (
    <button
      className={styles.card}
      onClick={() => openDetail({
        ticker: etf.ticker,
        name: nameDisplay,
        etfLabel: etf.label,
        etfCategory: categoryZh,
        etfDescription: desc || undefined,
        etfPrice: etf.closeAtSignal,
        etfPrevClose: etf.prevClose,
        etfIndicators: etf.indicators,
      })}
    >
      <div className={styles.top}>
        <div className={styles.logoWrap}>
          {logo
            ? <img src={logo} alt={etf.ticker} className={styles.logo} />
            : <div className={styles.logoFallback}>{etf.ticker.slice(0, 2)}</div>
          }
        </div>

        <div className={styles.info}>
          <div className={styles.nameRow}>
            <span className={styles.nameZh}>{nameDisplay}</span>
            <span className={styles.ticker}>{etf.ticker} · {categoryZh}</span>
          </div>
          {desc && <p className={styles.desc}>{desc}</p>}
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={styles.priceBlock}>
          <div className={styles.priceRow}>
          {price !== null
            ? <span className={styles.price}>${price.toFixed(2)}</span>
            : <span className={styles.price}>—</span>
          }
          {dayPct !== null && (
            <span className={dayPct >= 0 ? styles.gain : styles.loss}>
              今日 {dayPct >= 0 ? '▲' : '▼'}{Math.abs(dayPct).toFixed(1)}%
            </span>
          )}
          {etf.indicators.return13w !== null && (
            <span className={etf.indicators.return13w >= 0 ? styles.gain : styles.loss}>
              13w {etf.indicators.return13w >= 0 ? '+' : ''}{(etf.indicators.return13w * 100).toFixed(1)}%
            </span>
          )}
          </div>
        </div>

        <div className={styles.sideRow}>
          {sparklineValues.length > 1 && (
            <Sparkline values={sparklineValues} width={72} height={24} gain={dayPct !== null ? dayPct >= 0 : undefined} />
          )}
          <div className={styles.badgeRow}>
            <EtfSignalBadge label={etf.label} showCode />
          </div>
        </div>
      </div>
    </button>
  )
}
