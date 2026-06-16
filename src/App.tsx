import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { etfUniverse } from './data/etfUniverse'
import { portfolioPresets } from './data/portfolioPresets'
import { deriveRegimeInputs } from './engine/marketRegime'
import { calculatePortfolioValuation } from './engine/portfolioValuation'
import { runSignalEngine } from './engine/signalEngine'
import { FredMacroProvider } from './services/macro/fredProvider'
import { buildMarketDataSnapshot } from './services/marketData/normalizeMarketData'
import { YahooFinanceFxProvider, YahooFinancePriceProvider } from './services/marketData/yahooFinanceProvider'
import type { FxRate } from './types/fx'
import type { MacroSnapshot } from './types/macro'
import type { RegimeInputs } from './types/market'
import type { Holding, Portfolio } from './types/portfolio'
import type { ETFPriceData } from './types/price'
import type { JournalEntry } from './types/journal'
import type { Signal, SignalAction, SignalPriority } from './types/signal'
import { holdingsToCsv, parseHoldingsCsv } from './utils/csv'
import './styles/dashboard.css'

type TabId = 'action' | 'portfolio' | 'signals' | 'universe' | 'journal'
type SignalFilter = 'ALL' | SignalAction
type PriorityFilter = 'ALL' | SignalPriority
type CategoryFilter = 'ALL' | string

const priceProvider = new YahooFinancePriceProvider()
const fxProvider = new YahooFinanceFxProvider()
const fredProvider = new FredMacroProvider()
const STORAGE_KEYS = {
  portfolio: 'etf:portfolio',
  preset: 'etf:selectedPreset',
  journal: 'etf:journal',
  lastReviewed: 'etf:lastReviewed',
  regime: 'etf:regimeInputs',
  fxOverride: 'etf:fxOverride'
}

function readJson<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key)
  if (!raw) return fallback

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T): void {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatWeight(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatHkd(value: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    maximumFractionDigits: 0
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-HK', { maximumFractionDigits: 2 }).format(value)
}

function downloadText(filename: string, content: string, type = 'application/json'): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function journalToCsv(entries: JournalEntry[]): string {
  const headers = ['date', 'status', 'action', 'ticker', 'amountHkd', 'price', 'reason', 'regime', 'notes']
  const rows = entries.map(entry =>
    headers
      .map(header => {
        const value = entry[header as keyof JournalEntry] ?? ''
        return `"${String(value).replace(/"/g, '""')}"`
      })
      .join(',')
  )

  return [headers.join(','), ...rows].join('\n')
}

function createJournalEntry(signal: Signal, status: JournalEntry['status'], regime: string): JournalEntry {
  return {
    id: `${status.toLowerCase()}:${signal.id}:${Date.now()}`,
    date: new Date().toISOString(),
    action: signal.action,
    ticker: signal.ticker,
    amountHkd: signal.suggestedAmountHkd,
    reason: signal.reason,
    regime,
    sourceSignalId: signal.id,
    status,
    notes: ''
  }
}

function defaultRegimeInputs(): RegimeInputs {
  return {
    vixLevel: null,
    vixSource: 'AUTO',
    sp500Above200Ma: null,
    sp500Source: 'AUTO',
    hkMarketAbove200Ma: null,
    hkMarketSource: 'AUTO',
    goldAbove200Ma: null,
    goldSource: 'AUTO',
    creditSpreadWidening: false,
    creditSpreadSource: 'MANUAL',
    inflationRising: false,
    inflationSource: 'MANUAL'
  }
}

function mergeRegimeInputs(autoInputs: RegimeInputs, manualInputs: RegimeInputs): RegimeInputs {
  return {
    ...autoInputs,
    vixLevel: manualInputs.vixSource === 'MANUAL' ? manualInputs.vixLevel : autoInputs.vixLevel,
    vixSource: manualInputs.vixSource,
    sp500Above200Ma:
      manualInputs.sp500Source === 'MANUAL' ? manualInputs.sp500Above200Ma : autoInputs.sp500Above200Ma,
    sp500Source: manualInputs.sp500Source,
    hkMarketAbove200Ma:
      manualInputs.hkMarketSource === 'MANUAL'
        ? manualInputs.hkMarketAbove200Ma
        : autoInputs.hkMarketAbove200Ma,
    hkMarketSource: manualInputs.hkMarketSource,
    goldAbove200Ma:
      manualInputs.goldSource === 'MANUAL' ? manualInputs.goldAbove200Ma : autoInputs.goldAbove200Ma,
    goldSource: manualInputs.goldSource,
    creditSpreadWidening: manualInputs.creditSpreadWidening,
    creditSpreadSource: 'MANUAL',
    inflationRising: manualInputs.inflationRising,
    inflationSource: 'MANUAL'
  }
}

function blankHolding(): Holding {
  return {
    ticker: 'SGOV',
    shares: 0,
    averageCost: 0,
    currency: 'USD'
  }
}

function normalizePortfolio(portfolio: Partial<Portfolio> | null | undefined): Portfolio {
  return {
    id: portfolio?.id ?? 'my-portfolio',
    name: portfolio?.name ?? 'My ETF Portfolio',
    baseCurrency: 'HKD',
    startingPortfolioValueHkd: portfolio?.startingPortfolioValueHkd ?? 0,
    netContributionHkd: portfolio?.netContributionHkd ?? 0,
    cashBalanceHkd: portfolio?.cashBalanceHkd ?? 0,
    holdings: portfolio?.holdings ?? []
  }
}

export default function App() {
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const csvInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('action')
  const [prices, setPrices] = useState<Map<string, ETFPriceData>>(new Map())
  const [usdHkd, setUsdHkd] = useState<FxRate | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRefreshingMacro, setIsRefreshingMacro] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [manualFxRate, setManualFxRate] = useState<number | null>(() =>
    readJson<number | null>(STORAGE_KEYS.fxOverride, null)
  )
  const [macroSnapshot, setMacroSnapshot] = useState<MacroSnapshot | null>(null)
  const [portfolio, setPortfolio] = useState<Portfolio>(() =>
    normalizePortfolio(readJson<Partial<Portfolio> | null>(STORAGE_KEYS.portfolio, null))
  )
  const [selectedPresetId, setSelectedPresetId] = useState(() =>
    readJson<string>(STORAGE_KEYS.preset, 'balanced')
  )
  const [journal, setJournal] = useState<JournalEntry[]>(() =>
    readJson<JournalEntry[]>(STORAGE_KEYS.journal, [])
  )
  const [lastReviewed, setLastReviewed] = useState<string | null>(() =>
    readJson<string | null>(STORAGE_KEYS.lastReviewed, null)
  )
  const [manualRegimeInputs, setManualRegimeInputs] = useState<RegimeInputs>(() =>
    readJson<RegimeInputs>(STORAGE_KEYS.regime, defaultRegimeInputs())
  )
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('ALL')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL')
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL')
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set())
  const [pendingFillTicker, setPendingFillTicker] = useState<string | null>(null)

  const activePreset = portfolioPresets.find(preset => preset.id === selectedPresetId) ?? portfolioPresets[0]
  const isFirstTimeUse = portfolio.holdings.length === 0
  const presetBenchmarkReturn = activePreset.policy.benchmarkReturn
  const effectiveUsdHkd: FxRate | null =
    manualFxRate === null
      ? usdHkd
      : {
          pair: 'USDHKD',
          rate: manualFxRate,
          fetchedAt: new Date().toISOString(),
          isManualOverride: true,
          isStale: false,
          source: 'MANUAL'
        }
  const snapshot = buildMarketDataSnapshot({ etfs: etfUniverse, prices, usdHkd: effectiveUsdHkd })
  const autoRegimeInputs = deriveRegimeInputs(snapshot.etfs)
  const regimeInputs = mergeRegimeInputs(autoRegimeInputs, manualRegimeInputs)
  const valuation = calculatePortfolioValuation({ portfolio, etfs: snapshot.etfs, usdHkd: effectiveUsdHkd })
  const engineResult = runSignalEngine({
    portfolio,
    preset: activePreset,
    marketData: snapshot,
    regimeInputs
  })
  const targetByTicker = new Map(activePreset.allocations.map(allocation => [allocation.ticker, allocation.targetWeight]))
  const etfDescByTicker = new Map(snapshot.etfs.map(etf => [etf.ticker, etf.description]))

  const filteredSignals = engineResult.signalFeed.filter(signal => {
    if (signalFilter !== 'ALL' && signal.action !== signalFilter) return false
    if (priorityFilter !== 'ALL' && signal.priority !== priorityFilter) return false
    if (blockedOnly && (!signal.blockedBy || signal.blockedBy.length === 0)) return false
    return true
  })

  const filteredUniverse = snapshot.etfs.filter(etf => {
    if (categoryFilter !== 'ALL' && etf.category !== categoryFilter) return false
    return true
  })

  useEffect(() => writeJson(STORAGE_KEYS.portfolio, portfolio), [portfolio])
  useEffect(() => writeJson(STORAGE_KEYS.preset, selectedPresetId), [selectedPresetId])
  useEffect(() => writeJson(STORAGE_KEYS.journal, journal), [journal])
  useEffect(() => writeJson(STORAGE_KEYS.lastReviewed, lastReviewed), [lastReviewed])
  useEffect(() => writeJson(STORAGE_KEYS.regime, manualRegimeInputs), [manualRegimeInputs])
  useEffect(() => writeJson(STORAGE_KEYS.fxOverride, manualFxRate), [manualFxRate])

  async function refreshMarketData() {
    setIsRefreshing(true)
    setLastError(null)

    const tickers = [...new Set([...etfUniverse.map(etf => etf.ticker), '^VIX'])]
    const [priceResult, fxResult] = await Promise.allSettled([
      priceProvider.getBatch(tickers),
      manualFxRate === null ? fxProvider.getUsdHkd() : Promise.resolve(effectiveUsdHkd)
    ])

    if (priceResult.status === 'fulfilled') {
      setPrices(priceResult.value as Map<string, ETFPriceData>)
    } else {
      setLastError(
        priceResult.reason instanceof Error ? priceResult.reason.message : 'Price refresh failed'
      )
    }

    if (fxResult.status === 'fulfilled') {
      setUsdHkd(fxResult.value as FxRate)
    } else {
      const fxMessage = fxResult.reason instanceof Error ? fxResult.reason.message : 'FX refresh failed'
      setLastError(previous => (previous ? `${previous}; ${fxMessage}` : fxMessage))
    }

    setIsRefreshing(false)
    setDismissedIds(new Set())
  }

  async function refreshMacroData() {
    setIsRefreshingMacro(true)
    setLastError(null)

    try {
      const macro = await fredProvider.getMacroSnapshot()
      setMacroSnapshot(macro)
      setManualRegimeInputs(current => ({
        ...current,
        creditSpreadWidening: macro.creditSpreadWidening,
        inflationRising: macro.inflationRising
      }))
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'FRED macro refresh failed')
    } finally {
      setIsRefreshingMacro(false)
    }
  }

  useEffect(() => {
    void refreshMarketData()
  }, [])

  function updateHolding(index: number, patch: Partial<Holding>) {
    setPortfolio(current => ({
      ...current,
      holdings: current.holdings.map((holding, holdingIndex) =>
        holdingIndex === index ? { ...holding, ...patch } : holding
      )
    }))
  }

  function addHolding() {
    setPortfolio(current => ({ ...current, holdings: [...current.holdings, blankHolding()] }))
  }

  function removeHolding(index: number) {
    setPortfolio(current => ({
      ...current,
      holdings: current.holdings.filter((_, holdingIndex) => holdingIndex !== index)
    }))
  }

  function addJournal(signal: Signal, status: JournalEntry['status']) {
    setJournal(current => [
      createJournalEntry(signal, status, engineResult.marketRegime),
      ...current
    ])
    setDismissedIds(current => new Set([...current, signal.id]))

    if (status === 'EXECUTED' && (signal.action === 'ADD' || signal.action === 'WAIT')) {
      const alreadyHeld = portfolio.holdings.some(h => h.ticker === signal.ticker)
      if (!alreadyHeld) {
        const etf = snapshot.etfs.find(e => e.ticker === signal.ticker)
        setPortfolio(current => ({
          ...current,
          holdings: [
            ...current.holdings,
            {
              ticker: signal.ticker,
              shares: 0,
              averageCost: etf?.priceData?.currentPrice ?? 0,
              currency: (etf?.currency ?? 'USD') as Holding['currency']
            }
          ]
        }))
        setActiveTab('portfolio')
        setPendingFillTicker(signal.ticker)
      }
    }
  }

  function updateJournalNotes(id: string, notes: string) {
    setJournal(current => current.map(entry => (entry.id === id ? { ...entry, notes } : entry)))
  }

  function markReviewed() {
    setLastReviewed(new Date().toISOString())
  }

  function exportPortfolioJson() {
    downloadText('etf-portfolio-backup.json', JSON.stringify({ portfolio, selectedPresetId }, null, 2))
  }

  function exportHoldingsCsv() {
    downloadText('etf-holdings.csv', holdingsToCsv(portfolio.holdings), 'text/csv')
  }

  function exportJournalCsv() {
    downloadText('etf-journal.csv', journalToCsv(journal), 'text/csv')
  }

  function exportJournalJson() {
    downloadText('etf-journal.json', JSON.stringify(journal, null, 2))
  }

  function importPortfolioJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result)) as {
          portfolio?: Portfolio
          selectedPresetId?: string
        }
        if (payload.portfolio) setPortfolio(normalizePortfolio(payload.portfolio))
        if (payload.selectedPresetId) setSelectedPresetId(payload.selectedPresetId)
      } catch {
        setLastError('Portfolio import failed: invalid JSON file')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function importHoldingsCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const holdings = parseHoldingsCsv(String(reader.result))
        if (holdings.length === 0) {
          setLastError('CSV import found no holdings. Expected ticker/symbol, shares/quantity, averageCost/avgPrice.')
          return
        }
        setPortfolio(current => ({ ...current, holdings }))
      } catch {
        setLastError('Holdings CSV import failed')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'action', label: 'Action Centre' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'signals', label: 'Signal Feed' },
    { id: 'universe', label: 'ETF Universe' },
    { id: 'journal', label: 'Journal' }
  ]

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Global ETF Command Centre</p>
            <h1>Weekly action engine</h1>
          </div>
          <div className="header-actions">
            <div className="preset-stack">
              <select value={selectedPresetId} onChange={event => setSelectedPresetId(event.target.value)}>
                {portfolioPresets.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <span className="preset-benchmark">
                {activePreset.benchmarkLabel} · Benchmark {formatPercent(presetBenchmarkReturn)} / year
              </span>
              <span className="preset-benchmark">
                Reserve {formatWeight(activePreset.policy.targetCashReserveWeight)} · Min trade{' '}
                {formatHkd(activePreset.policy.minTradeSizeHkd)}
              </span>
            </div>
            <button className="refresh-button" type="button" onClick={refreshMarketData} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing...' : 'Refresh prices'}
            </button>
          </div>
        </header>

        <div className="dashboard-grid">
          <article className="panel">
            <h2>Portfolio value</h2>
            <strong>{formatHkd(engineResult.portfolioValueHkd)}</strong>
            <span>
              Invested {formatHkd(valuation.investedValueHkd)} · Cash {formatHkd(valuation.cashBalanceHkd)}
            </span>
          </article>
          <article className="panel">
            <h2>Return status</h2>
            <strong>{engineResult.returnTracker.status.replace('_', ' ')}</strong>
            <span>
              {engineResult.returnTracker.actualYtdReturn === null
                ? `Target pace ${formatPercent(engineResult.returnTracker.proRatedTarget)}. ${activePreset.name} benchmark ${formatPercent(presetBenchmarkReturn)} / year.`
                : `${formatPercent(engineResult.returnTracker.actualYtdReturn)} YTD vs ${formatPercent(engineResult.returnTracker.proRatedTarget)} target. Benchmark ${formatPercent(presetBenchmarkReturn)} / year.`}
            </span>
            <span>{engineResult.returnTracker.statusReason}</span>
          </article>
          <article className="panel">
            <h2>Regime</h2>
            <strong>{engineResult.marketRegime.replace('_', ' ')}</strong>
            <span>{engineResult.blockedSignalCount} blocked signals</span>
          </article>
          <article className="panel">
            <h2>Actions</h2>
            <strong>{engineResult.finalSignals.length}</strong>
            <span>{engineResult.highPriorityCount} high priority</span>
          </article>
        </div>

        {lastError ? <p className="warning">Market data warning: {lastError}</p> : null}

        <nav className="tab-nav" aria-label="Dashboard tabs">
          {tabs.map(tab => (
            <button
              className={activeTab === tab.id ? 'active' : ''}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'action' ? (
          <section className="panel wide">
            <div className="section-header">
              <div>
                <h2>Action Centre</h2>
                <p className="subtle">
                  {isFirstTimeUse
                    ? 'First-time setup mode. Suggestions below are starter allocations from your selected preset.'
                    : `Last reviewed: ${lastReviewed ? new Date(lastReviewed).toLocaleString() : 'not marked yet'}`}
                </p>
                <p className="subtle">
                  Mandate: keep {formatWeight(activePreset.policy.targetCashReserveWeight)} cash, new positions capped at{' '}
                  {formatWeight(activePreset.policy.maxNewPositionWeight)}, single ETF limit {formatWeight(activePreset.policy.maxSingleEtfWeight)}.
                </p>
              </div>
              <button type="button" onClick={markReviewed}>Mark reviewed</button>
            </div>
            <div className="signal-list">
              {engineResult.finalSignals.filter(s => !dismissedIds.has(s.id)).slice(0, 8).map(signal => (
                <div className="signal-row action-row" key={signal.id}>
                  <span className={`action-badge action-${signal.action.toLowerCase()}`}>{signal.action}</span>
                  <div className="signal-meta">
                    <strong
                      className="ticker-tip"
                      data-tooltip={etfDescByTicker.get(signal.ticker)}
                    >{signal.ticker}</strong>
                    <span className="meta-inline">Target {formatWeight(signal.targetWeight)}</span>
                  </div>
                  <span>{signal.reason}</span>
                  <div className="signal-side">
                    {signal.suggestedAmountHkd !== undefined ? (
                      <span className="amount-badge">{formatHkd(signal.suggestedAmountHkd)}</span>
                    ) : null}
                    {signal.suggestedPostTradeWeight !== undefined ? (
                      <span className="meta-inline">Post {formatWeight(signal.suggestedPostTradeWeight)}</span>
                    ) : null}
                    <span className="category-badge">{signal.category}</span>
                    <em>{signal.priority}</em>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => addJournal(signal, 'EXECUTED')}>Execute</button>
                    <button type="button" onClick={() => addJournal(signal, 'IGNORED')}>Ignore</button>
                  </div>
                </div>
              ))}
              {engineResult.finalSignals.filter(s => !dismissedIds.has(s.id)).length === 0 ? (
                <p className="subtle">
                  {isFirstTimeUse
                    ? 'No starter actions yet. Refresh prices or switch to another preset.'
                    : dismissedIds.size > 0
                      ? `All ${dismissedIds.size} signal${dismissedIds.size > 1 ? 's' : ''} actioned. Refresh prices when ready for next cycle.`
                      : 'No action signals this week. Portfolio is within rebalance thresholds.'}
                </p>
              ) : null}
              {isFirstTimeUse ? (
                <div className="empty-state">
                  <p>No holdings in your portfolio yet.</p>
                  <p className="subtle">Enter your cash balance first, then follow the starter actions above. After each buy, open the Portfolio tab to record shares, average cost, and currency.</p>
                  <button type="button" onClick={() => setActiveTab('portfolio')}>Open portfolio setup</button>
                </div>
              ) : null}
            </div>
            <div className="market-controls">
              <label>
                VIX override
                <input
                  type="number"
                  value={manualRegimeInputs.vixLevel ?? ''}
                  placeholder={autoRegimeInputs.vixLevel?.toFixed(1) ?? 'auto'}
                  onChange={event =>
                    setManualRegimeInputs(current => ({
                      ...current,
                      vixLevel: event.target.value === '' ? null : Number(event.target.value),
                      vixSource: event.target.value === '' ? 'AUTO' : 'MANUAL'
                    }))
                  }
                />
              </label>
              <label>
                Credit spread widening
                <input
                  type="checkbox"
                  checked={Boolean(manualRegimeInputs.creditSpreadWidening)}
                  onChange={event =>
                    setManualRegimeInputs(current => ({
                      ...current,
                      creditSpreadWidening: event.target.checked
                    }))
                  }
                />
              </label>
              <label>
                Inflation rising
                <input
                  type="checkbox"
                  checked={Boolean(manualRegimeInputs.inflationRising)}
                  onChange={event =>
                    setManualRegimeInputs(current => ({
                      ...current,
                      inflationRising: event.target.checked
                    }))
                  }
                />
              </label>
              <label>
                FRED macro
                <button type="button" onClick={refreshMacroData} disabled={isRefreshingMacro}>
                  {isRefreshingMacro ? 'Refreshing macro...' : 'Refresh FRED'}
                </button>
              </label>
            </div>
            {macroSnapshot ? (
              <p className="subtle macro-readout">
                Credit spread {macroSnapshot.creditSpread?.toFixed(2) ?? '-'} · Inflation expectation{' '}
                {macroSnapshot.inflationExpectation?.toFixed(2) ?? '-'} · Fetched{' '}
                {new Date(macroSnapshot.fetchedAt).toLocaleString()}
              </p>
            ) : null}
          </section>
        ) : null}

        {activeTab === 'portfolio' ? (
          <section className="panel wide">
            <div className="section-header">
              <div>
                <h2>Portfolio Monitor</h2>
                <p className="subtle">
                  {valuation.holdings.length} holdings, {snapshot.etfs.length - snapshot.missingPriceTickers.length} prices ready.
                </p>
              </div>
              <div className="row-actions">
                <button type="button" onClick={addHolding}>Add holding</button>
                <button type="button" onClick={exportPortfolioJson}>Export JSON</button>
                <button type="button" onClick={exportHoldingsCsv}>Export CSV</button>
                <button type="button" onClick={() => importInputRef.current?.click()}>Import JSON</button>
                <button type="button" onClick={() => csvInputRef.current?.click()}>Import CSV</button>
                <input ref={importInputRef} type="file" accept="application/json" hidden onChange={importPortfolioJson} />
                <input ref={csvInputRef} type="file" accept=".csv,text/csv" hidden onChange={importHoldingsCsv} />
              </div>
            </div>
            <div className="settings-grid">
              <label>
                Start value HKD
                <input
                  type="number"
                  value={portfolio.startingPortfolioValueHkd}
                  onChange={event =>
                    setPortfolio(current => ({
                      ...current,
                      startingPortfolioValueHkd: Number(event.target.value)
                    }))
                  }
                />
              </label>
              <label>
                Cash balance HKD
                <input
                  type="number"
                  value={portfolio.cashBalanceHkd}
                  onChange={event =>
                    setPortfolio(current => ({ ...current, cashBalanceHkd: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Net contributions HKD
                <input
                  type="number"
                  value={portfolio.netContributionHkd}
                  onChange={event =>
                    setPortfolio(current => ({ ...current, netContributionHkd: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                USD/HKD
                <input
                  type="number"
                  value={manualFxRate ?? effectiveUsdHkd?.rate ?? ''}
                  placeholder={usdHkd?.rate.toFixed(4) ?? 'auto'}
                  onChange={event =>
                    setManualFxRate(event.target.value === '' ? null : Number(event.target.value))
                  }
                />
                <button type="button" onClick={() => setManualFxRate(null)}>Use auto FX</button>
              </label>
            </div>
            {pendingFillTicker ? (
              <p className="fill-banner">
                <strong>{pendingFillTicker}</strong> added — fill in the number of shares you bought below.
                <button type="button" onClick={() => setPendingFillTicker(null)}>Dismiss</button>
              </p>
            ) : null}
            {portfolio.holdings.length === 0 ? (
              <div className="empty-state">
                <p>No holdings yet.</p>
                <p className="subtle">Set your available cash first, then add each ETF position you hold. Portfolio value, cash reserve, and rebalance signals update in real time.</p>
                <button type="button" onClick={addHolding}>Add first holding</button>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Shares</th>
                      <th>Avg cost</th>
                      <th>Currency</th>
                      <th>Price</th>
                      <th>Value HKD</th>
                      <th>Weight</th>
                      <th>Target</th>
                      <th>Gap</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {valuation.holdings.map((holding, index) => {
                      const target = targetByTicker.get(holding.ticker) ?? 0
                      const isPending = holding.ticker === pendingFillTicker
                      return (
                        <tr key={`${holding.ticker}-${index}`} className={isPending ? 'row-pending' : ''}>
                          <td>
                            <input value={holding.ticker} onChange={event => updateHolding(index, { ticker: event.target.value.toUpperCase() })} />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={holding.shares}
                              className={isPending && holding.shares === 0 ? 'input-highlight' : ''}
                              autoFocus={isPending}
                              onChange={event => {
                                updateHolding(index, { shares: Number(event.target.value) })
                                if (Number(event.target.value) > 0) setPendingFillTicker(null)
                              }}
                            />
                          </td>
                          <td>
                            <input type="number" value={holding.averageCost} onChange={event => updateHolding(index, { averageCost: Number(event.target.value) })} />
                          </td>
                          <td>
                            <select value={holding.currency} onChange={event => updateHolding(index, { currency: event.target.value as Holding['currency'] })}>
                              <option value="USD">USD</option>
                              <option value="HKD">HKD</option>
                            </select>
                          </td>
                          <td>{holding.currentPrice ? formatNumber(holding.currentPrice) : 'DATA REVIEW'}</td>
                          <td>{holding.currentValueHkd ? formatHkd(holding.currentValueHkd) : '-'}</td>
                          <td>{formatWeight(holding.marketValueWeight)}</td>
                          <td>{formatWeight(target)}</td>
                          <td>{formatWeight(target - holding.marketValueWeight)}</td>
                          <td><button type="button" onClick={() => removeHolding(index)}>Remove</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'signals' ? (
          <section className="panel wide">
            <div className="section-header">
              <h2>Signal Feed</h2>
              <div className="filter-row">
                <select value={signalFilter} onChange={event => setSignalFilter(event.target.value as SignalFilter)}>
                  {['ALL', 'ADD', 'HOLD', 'WAIT', 'WATCH', 'TRIM', 'REDUCE', 'REVIEW'].map(action => (
                    <option key={action} value={action}>{action}</option>
                  ))}
                </select>
                <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value as PriorityFilter)}>
                  {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map(priority => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
                <label className="check-label">
                  <input type="checkbox" checked={blockedOnly} onChange={event => setBlockedOnly(event.target.checked)} />
                  Blocked only
                </label>
              </div>
            </div>
            <div className="signal-list">
              {filteredSignals.map(signal => (
                <div className="signal-row action-row" key={signal.id}>
                  <span className={`action-badge action-${signal.action.toLowerCase()}`}>{signal.action}</span>
                  <div className="signal-meta">
                    <strong
                      className="ticker-tip"
                      data-tooltip={etfDescByTicker.get(signal.ticker)}
                    >{signal.ticker}</strong>
                    <span className="meta-inline">Target {formatWeight(signal.targetWeight)}</span>
                  </div>
                  <span>{signal.reason}</span>
                  <div className="signal-side">
                    {signal.suggestedAmountHkd !== undefined ? (
                      <span className="amount-badge">{formatHkd(signal.suggestedAmountHkd)}</span>
                    ) : null}
                    <span className="category-badge">{signal.category}</span>
                    <em>{signal.priority}</em>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => addJournal(signal, 'EXECUTED')}>Execute</button>
                    <button type="button" onClick={() => addJournal(signal, 'IGNORED')}>Ignore</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === 'universe' ? (
          <section className="panel wide">
            <div className="section-header">
              <div>
                <h2>ETF Universe</h2>
                <p className="subtle">Prices are real/cached, scores are rule-derived from fetched price data.</p>
              </div>
              <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
                <option value="ALL">All categories</option>
                {[...new Set(etfUniverse.map(etf => etf.category))].map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Risk</th>
                    <th>Price</th>
                    <th>3M</th>
                    <th>6M</th>
                    <th>200MA</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUniverse.map(etf => (
                    <tr key={etf.ticker}>
                      <td>
                        <span className="ticker-tip" data-tooltip={etf.description}>{etf.ticker}</span>
                      </td>
                      <td>{etf.name}</td>
                      <td>{etf.category}</td>
                      <td>{etf.riskLevel}</td>
                      <td>{etf.priceData ? formatNumber(etf.priceData.currentPrice) : 'DATA REVIEW'}</td>
                      <td>{etf.priceData ? formatPercent(etf.priceData.threeMonthReturn) : '-'}</td>
                      <td>{etf.priceData ? formatPercent(etf.priceData.sixMonthReturn) : '-'}</td>
                      <td>{etf.priceData ? formatNumber(etf.priceData.movingAverage200) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === 'journal' ? (
          <section className="panel wide">
            <div className="section-header">
              <div>
                <h2>Journal</h2>
                <p className="subtle">{journal.length} decisions stored locally.</p>
              </div>
              <div className="row-actions">
                <button type="button" onClick={exportJournalCsv}>Export CSV</button>
                <button type="button" onClick={exportJournalJson}>Export JSON</button>
              </div>
            </div>
            <div className="journal-list">
              {journal.map(entry => (
                <article className="journal-entry" key={entry.id}>
                  <div>
                    <span className={`action-badge action-${entry.action.toLowerCase()}`}>{entry.status}</span>
                    <strong>{entry.ticker} {entry.action}</strong>
                    <p>{entry.reason}</p>
                    <small>{new Date(entry.date).toLocaleString()} · {entry.regime}</small>
                  </div>
                  <textarea
                    value={entry.notes ?? ''}
                    placeholder="Notes"
                    onChange={event => updateJournalNotes(entry.id, event.target.value)}
                  />
                </article>
              ))}
              {journal.length === 0 ? <p>No journal entries yet. Execute or ignore a signal to create one.</p> : null}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  )
}
