import { useMemo, useState } from 'react'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useEtfSignals } from '../../shared/hooks/useEtfSignals'
import { useApp } from '../../app/providers/AppContext'
import { StockCard } from '../../shared/components/StockCard'
import { EtfCard } from '../../shared/components/EtfCard'
import { SignalBadge } from '../../shared/components/SignalBadge'
import { LoadingScreen, ErrorScreen } from '../../shared/components/LoadingScreen'
import { HkPlaceholder } from '../../shared/components/HkPlaceholder'
import { getStockMeta } from '../../shared/i18n/stockNames'
import { etfUniverse } from '../../../data/etfUniverse'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import type { StockSignalLabel } from '../../../types/signal'
import type { EtfSignalEntry, EtfSignalLabel } from '../../shared/hooks/useEtfSignals'
import styles from './DiscoverView.module.css'

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

const etfCategoryMap = new Map(etfUniverse.map(e => [e.ticker, e.category]))

type AssetType = 'stocks' | 'etf' | 'changes'
type Filter = 'all' | 'bullish' | 'watchlist' | 'bearish'

const BULL_SET = new Set<StockSignalLabel>(['LONG_BREAK','LONG_VCP','LONG_BOUNCE','LONG_BASE','WATCH'])
const BEAR_SET = new Set<StockSignalLabel>(['SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP'])

function getChangedStocks(stocks: StockSnapshotEntry[]) {
  return stocks
    .filter(s => s.previousLabel !== undefined && s.previousLabel !== s.label)
    .sort((a, b) => {
      const aUp = BULL_SET.has(a.label) && !BULL_SET.has(a.previousLabel!) ? -1 : 0
      const bUp = BULL_SET.has(b.label) && !BULL_SET.has(b.previousLabel!) ? -1 : 0
      if (aUp !== bUp) return aUp - bUp
      return (b.rsRank ?? 0) - (a.rsRank ?? 0)
    })
}

const BULLISH_STOCK: StockSignalLabel[] = ['LONG_BREAK','LONG_VCP','LONG_BOUNCE']
const WATCHLIST_STOCK: StockSignalLabel[] = ['LONG_BASE','WATCH']
const BEARISH_STOCK: StockSignalLabel[] = ['SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP']

const BULLISH_ETF: EtfSignalLabel[] = ['FAVOUR']
const WATCHLIST_ETF: EtfSignalLabel[] = ['WATCH', 'WAIT']
const BEARISH_ETF: EtfSignalLabel[] = ['AVOID']

const FILTER_LABELS: { id: Filter; label: string }[] = [
  { id: 'all',       label: '全部' },
  { id: 'bullish',   label: '🟢 看漲' },
  { id: 'watchlist', label: '🟡 觀察' },
  { id: 'bearish',   label: '🔴 偏弱' },
]

function filterStocks(stocks: StockSnapshotEntry[], f: Filter): StockSnapshotEntry[] {
  switch (f) {
    case 'bullish':   return stocks.filter(s => BULLISH_STOCK.includes(s.label))
    case 'watchlist': return stocks.filter(s => WATCHLIST_STOCK.includes(s.label))
    case 'bearish':   return stocks.filter(s => BEARISH_STOCK.includes(s.label))
    default:          return stocks
  }
}

function filterEtfs(etfs: EtfSignalEntry[], f: Filter): EtfSignalEntry[] {
  switch (f) {
    case 'bullish':   return etfs.filter(e => BULLISH_ETF.includes(e.label))
    case 'watchlist': return etfs.filter(e => WATCHLIST_ETF.includes(e.label))
    case 'bearish':   return etfs.filter(e => BEARISH_ETF.includes(e.label))
    default:          return etfs
  }
}

export function DiscoverView() {
  const { mode, scope } = useApp()
  const snap = useSnapshot()
  const etfState = useEtfSignals()
  const [assetType, setAssetType] = useState<AssetType>('stocks')
  const [filter, setFilter] = useState<Filter>('all')
  const [etfCategory, setEtfCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const displayedStocks = useMemo(() => {
    if (snap.status !== 'ok') return []
    let stocks = filterStocks(snap.snapshot.stocks, filter)
    if (search) {
      const q = search.toUpperCase()
      stocks = stocks.filter(s =>
        s.ticker.includes(q) || s.name.toUpperCase().includes(q)
      )
    }
    return [...stocks].sort((a, b) => {
      const aScore = BULLISH_STOCK.includes(a.label) ? 2 : WATCHLIST_STOCK.includes(a.label) ? 1 : 0
      const bScore = BULLISH_STOCK.includes(b.label) ? 2 : WATCHLIST_STOCK.includes(b.label) ? 1 : 0
      if (aScore !== bScore) return bScore - aScore
      return (b.rsRank ?? 0) - (a.rsRank ?? 0)
    })
  }, [snap, filter, search])

  const etfsForCategory = useMemo(() => {
    if (etfState.status !== 'ok') return []
    return filterEtfs(etfState.entries, filter)
  }, [etfState, filter])

  const availableCategories = useMemo(() => {
    const seen = new Set<string>()
    for (const e of etfsForCategory) {
      const cat = etfCategoryMap.get(e.ticker)
      if (cat) seen.add(cat)
    }
    return Array.from(seen)
  }, [etfsForCategory])

  const displayedEtfs = useMemo(() => {
    let etfs = etfsForCategory
    if (etfCategory) etfs = etfs.filter(e => etfCategoryMap.get(e.ticker) === etfCategory)
    if (search) {
      const q = search.toUpperCase()
      etfs = etfs.filter(e => e.ticker.includes(q))
    }
    const order: Record<EtfSignalLabel, number> = { FAVOUR: 3, WATCH: 2, WAIT: 1, AVOID: 0 }
    return [...etfs].sort((a, b) => {
      const labelDiff = (order[b.label] ?? 0) - (order[a.label] ?? 0)
      if (labelDiff !== 0) return labelDiff
      return (b.indicators.rankScore ?? 0) - (a.indicators.rankScore ?? 0)
    })
  }, [etfsForCategory, etfCategory, search])

  const changedStocks = useMemo(() => {
    if (snap.status !== 'ok') return []
    let stocks = getChangedStocks(snap.snapshot.stocks)
    if (search) {
      const q = search.toUpperCase()
      stocks = stocks.filter(s => s.ticker.includes(q) || s.name.toUpperCase().includes(q))
    }
    return stocks
  }, [snap, search])

  const isLoading = assetType === 'etf'
    ? etfState.status === 'loading'
    : snap.status === 'loading'

  const isError = assetType === 'etf'
    ? etfState.status === 'error'
    : snap.status === 'error'

  const errorMsg = assetType === 'etf'
    ? (etfState.status === 'error' ? etfState.message : '')
    : (snap.status === 'error' ? snap.message : '')

  if (scope === 'HK') return <HkPlaceholder />
  if (isLoading) return <LoadingScreen message={assetType === 'stocks' ? '載入股票資料…' : '載入 ETF 資料…'} />
  if (isError)   return <ErrorScreen message={errorMsg} />

  const count = assetType === 'stocks' ? displayedStocks.length
    : assetType === 'etf' ? displayedEtfs.length
    : changedStocks.length

  return (
    <div className={styles.view}>
      <div className={styles.searchWrap}>
        <div className={styles.searchInner}>
          <input
            className={styles.search}
            placeholder={assetType === 'stocks' ? '搜尋 ticker 或名稱…' : '搜尋 ETF ticker…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.clearBtn} onClick={() => setSearch('')}>✕</button>
          )}
        </div>
      </div>

      <div className={styles.typeToggle}>
        <button
          className={assetType === 'stocks' ? styles.typeActive : styles.typeBtn}
          onClick={() => { setAssetType('stocks'); setFilter('all'); setEtfCategory(null) }}
        >
          股票
        </button>
        <button
          className={assetType === 'etf' ? styles.typeActive : styles.typeBtn}
          onClick={() => { setAssetType('etf'); setFilter('all'); setEtfCategory(null) }}
        >
          ETF
        </button>
        <button
          className={assetType === 'changes' ? styles.typeActive : styles.typeBtn}
          onClick={() => { setAssetType('changes'); setFilter('all'); setEtfCategory(null) }}
        >
          今日動向
        </button>
      </div>

      {assetType !== 'changes' && (
        <div className={styles.filters}>
          {FILTER_LABELS.map(f => (
            <button
              key={f.id}
              className={filter === f.id ? styles.filterActive : styles.filterBtn}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {assetType === 'etf' && availableCategories.length > 1 && (
        <div className={styles.catRow}>
          <button
            className={etfCategory === null ? styles.catActive : styles.catBtn}
            onClick={() => setEtfCategory(null)}
          >
            全類別
          </button>
          {availableCategories.map(cat => (
            <button
              key={cat}
              className={etfCategory === cat ? styles.catActive : styles.catBtn}
              onClick={() => setEtfCategory(cat === etfCategory ? null : cat)}
            >
              {ETF_CATEGORY_ZH[cat] ?? cat}
            </button>
          ))}
        </div>
      )}

      <div className={styles.count}>{count} 項</div>

      <div className={styles.list}>
        {count === 0 ? (
          <div className={styles.empty}>
            {assetType === 'changes' ? '今日無信號變動記錄'
              : search ? `找不到「${search}」的結果` : '此篩選條件下沒有項目'}
          </div>
        ) : assetType === 'stocks'
          ? displayedStocks.map(s => <StockCard key={s.ticker} stock={s} showMode={mode} />)
          : assetType === 'etf'
          ? displayedEtfs.map(e => <EtfCard key={e.ticker} etf={e} showMode={mode} />)
          : changedStocks.map(s => <ChangeRow key={s.ticker} stock={s} />)
        }
      </div>
    </div>
  )
}

const LABEL_SHORT: Record<string, string> = {
  LONG_BREAK:'突破', LONG_VCP:'VCP', LONG_BOUNCE:'反彈', LONG_BASE:'整固',
  WATCH:'觀察', NEUTRAL:'中性', AVOID_CHOP:'震盪',
  SHORT_BREAK:'空頭突破', SHORT_BASE:'空頭整固', SHORT_WATCH:'空頭轉弱',
}

function ChangeRow({ stock }: { stock: StockSnapshotEntry }) {
  const { openDetail } = useApp()
  const meta = getStockMeta(stock.ticker, stock.name)
  const isUpgrade = BULL_SET.has(stock.label) && !BULL_SET.has(stock.previousLabel ?? 'NEUTRAL')
  const isDowngrade = BEAR_SET.has(stock.label)

  return (
    <button
      className={styles.changeRow}
      onClick={() => openDetail({ ticker: stock.ticker, name: meta.nameZh })}
    >
      <div className={styles.changeLeft}>
        <div className={styles.changeTicker}>{stock.ticker}</div>
        <div className={styles.changeName}>{meta.nameZh}</div>
        <div className={styles.changeArrow}>
          <span className={styles.changePrev}>{LABEL_SHORT[stock.previousLabel ?? ''] ?? stock.previousLabel}</span>
          <span className={isUpgrade ? styles.arrowUp : isDowngrade ? styles.arrowDown : styles.arrowFlat}>
            {isUpgrade ? '↑' : isDowngrade ? '↓' : '→'}
          </span>
          <span>{LABEL_SHORT[stock.label] ?? stock.label}</span>
        </div>
      </div>
      <SignalBadge label={stock.label} />
    </button>
  )
}
