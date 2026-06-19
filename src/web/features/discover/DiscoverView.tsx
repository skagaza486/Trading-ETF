import { useMemo, useState } from 'react'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useEtfSignals } from '../../shared/hooks/useEtfSignals'
import { useApp } from '../../app/providers/AppContext'
import { StockCard } from '../../shared/components/StockCard'
import { EtfCard } from '../../shared/components/EtfCard'
import { LoadingScreen, ErrorScreen } from '../../shared/components/LoadingScreen'
import { HkPlaceholder } from '../../shared/components/HkPlaceholder'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import type { StockSignalLabel } from '../../../types/signal'
import type { EtfSignalEntry, EtfSignalLabel } from '../../shared/hooks/useEtfSignals'
import styles from './DiscoverView.module.css'

type AssetType = 'stocks' | 'etf'
type Filter = 'all' | 'bullish' | 'watchlist' | 'bearish'

const BULLISH_STOCK: StockSignalLabel[] = ['LONG_BREAK','LONG_VCP','LONG_BOUNCE']
const WATCHLIST_STOCK: StockSignalLabel[] = ['LONG_BASE','WATCH']
const BEARISH_STOCK: StockSignalLabel[] = ['SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP']

const BULLISH_ETF: EtfSignalLabel[] = ['FAVOUR']
const WATCHLIST_ETF: EtfSignalLabel[] = ['WATCH']
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

  const displayedEtfs = useMemo(() => {
    if (etfState.status !== 'ok') return []
    let etfs = filterEtfs(etfState.entries, filter)
    if (search) {
      const q = search.toUpperCase()
      etfs = etfs.filter(e => e.ticker.includes(q))
    }
    const order: Record<EtfSignalLabel, number> = { FAVOUR: 3, WATCH: 2, WAIT: 1, AVOID: 0 }
    return [...etfs].sort((a, b) => (order[b.label] ?? 0) - (order[a.label] ?? 0))
  }, [etfState, filter, search])

  const isLoading = assetType === 'stocks'
    ? snap.status === 'loading'
    : etfState.status === 'loading'

  const isError = assetType === 'stocks'
    ? snap.status === 'error'
    : etfState.status === 'error'

  const errorMsg = assetType === 'stocks'
    ? (snap.status === 'error' ? snap.message : '')
    : (etfState.status === 'error' ? etfState.message : '')

  if (scope === 'HK') return <HkPlaceholder />
  if (isLoading) return <LoadingScreen message={assetType === 'stocks' ? '載入股票資料…' : '載入 ETF 資料…'} />
  if (isError)   return <ErrorScreen message={errorMsg} />

  const count = assetType === 'stocks' ? displayedStocks.length : displayedEtfs.length

  return (
    <div className={styles.view}>
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          placeholder={assetType === 'stocks' ? '搜尋 ticker 或名稱…' : '搜尋 ETF ticker…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.typeToggle}>
        <button
          className={assetType === 'stocks' ? styles.typeActive : styles.typeBtn}
          onClick={() => { setAssetType('stocks'); setFilter('all') }}
        >
          股票
        </button>
        <button
          className={assetType === 'etf' ? styles.typeActive : styles.typeBtn}
          onClick={() => { setAssetType('etf'); setFilter('all') }}
        >
          ETF
        </button>
      </div>

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

      <div className={styles.count}>{count} 項</div>

      <div className={styles.list}>
        {assetType === 'stocks'
          ? displayedStocks.map(s => <StockCard key={s.ticker} stock={s} showMode={mode} />)
          : displayedEtfs.map(e => <EtfCard key={e.ticker} etf={e} showMode={mode} />)
        }
      </div>
    </div>
  )
}
