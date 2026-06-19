import { useApp } from '../../app/providers/AppContext'
import { EtfSignalBadge } from './EtfSignalBadge'
import { getStockLogoAsset } from '../../../ui/assetRegistry'
import { etfUniverse } from '../../../data/etfUniverse'
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

const etfMap = new Map(etfUniverse.map(e => [e.ticker, e]))

type Props = { etf: EtfSignalEntry; showMode?: 'simple' | 'pro' }

export function EtfCard({ etf, showMode = 'simple' }: Props) {
  const { openDetail } = useApp()
  const meta = etfMap.get(etf.ticker)
  const logo = getStockLogoAsset(etf.ticker)
  const nameDisplay = meta?.name ?? etf.ticker
  const desc = meta?.description ?? ''
  const categoryZh = meta ? (ETF_CATEGORY_ZH[meta.category] ?? meta.category) : 'ETF'
  const price = etf.closeAtSignal

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
            <span className={styles.nameZh}>{etf.ticker}</span>
            <span className={styles.ticker}>{categoryZh}</span>
          </div>
          {desc && <p className={styles.desc}>{desc}</p>}
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={styles.priceRow}>
          {price !== null
            ? <span className={styles.price}>${price.toFixed(2)}</span>
            : <span className={styles.price}>—</span>
          }
        </div>

        <div className={styles.badgeRow}>
          <EtfSignalBadge label={etf.label} showCode={showMode === 'pro'} />
        </div>
      </div>
    </button>
  )
}
