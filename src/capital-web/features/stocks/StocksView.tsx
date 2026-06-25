import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSnapshot } from '../../../web/shared/hooks/useSnapshot'
import { checkEntryGate, isPaused } from '../../../engine/riskEngine'
import { computePositionSize } from '../../../engine/sizingEngine'
import { useCapitalApi } from '../../shared/hooks/useCapitalApi'
import type { Position, RiskState, EntryProposal, TradeResult } from '../../../types/capital'
import type { EodResult } from '../../../engine/exitEngine'
import styles from './StocksView.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTORS = [
  'Technology', 'Healthcare', 'Financials', 'Consumer Discretionary',
  'Industrials', 'Energy', 'Materials', 'Utilities',
  'Real Estate', 'Communication Services', 'Consumer Staples',
]

const TODAY = new Date().toISOString().slice(0, 10)

// ── Helpers ───────────────────────────────────────────────────────────────────

const REGIME_LABEL: Record<string, string> = {
  long_friendly: '偏多', neutral: '中性', short_friendly: '防守',
}
const REGIME_PILL: Record<string, string> = {
  long_friendly: 'pillGreen', neutral: 'pillYellow', short_friendly: 'pillRed',
}

function fmtDollar(cents: number): string {
  const d = cents / 100
  const sign = d < 0 ? '−$' : '$'
  const abs = Math.abs(d)
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`
  return `${sign}${abs.toFixed(0)}`
}

function fmtPct(r: number, signed = false): string {
  const s = signed && r > 0 ? '+' : ''
  return `${s}${(r * 100).toFixed(1)}%`
}

function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StocksView() {
  const { snapshot, loading: snapshotLoading } = useSnapshot()
  const regime = snapshot?.regime ?? 'neutral'
  const api = useCapitalApi()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Persisted state (fetched from API)
  const [riskState, setRiskState] = useState<RiskState>({
    capitalBaseCents: 6_400_000_00,
    currency: 'USD',
    regime,
    pauseUntil: null,
    last3Results: [],
  })
  const [positions, setPositions] = useState<Position[]>([])

  // Price inputs for EOD evaluation
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({})
  const [eodResult, setEodResult] = useState<EodResult | null>(null)

  // Entry gate form
  const [gForm, setGForm] = useState({ ticker: '', priceDollars: '', qty: '', sector: SECTORS[0], earnings: false })
  const [gateResult, setGateResult] = useState<ReturnType<typeof checkEntryGate> | null>(null)

  // Add position form
  const [showAdd, setShowAdd] = useState(false)
  const [aForm, setAForm] = useState({ ticker: '', qty: '', costDollars: '', sector: SECTORS[0] })

  // Capital base editing
  const [editCap, setEditCap] = useState(false)
  const [capInput, setCapInput] = useState('')

  const paused = isPaused(riskState, TODAY)

  // Sync regime from snapshot into riskState (regime is live from snapshot, not API)
  const effectiveRiskState: RiskState = useMemo(
    () => ({ ...riskState, regime }),
    [riskState, regime],
  )

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [fetchedPositions, fetchedRiskState] = await Promise.all([
        api.fetchPositions('stock'),
        api.fetchRiskState(),
      ])
      setPositions(fetchedPositions)
      setRiskState(fetchedRiskState)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { loadData() }, [loadData])

  // ── Mutations ───────────────────────────────────────────────────────────────

  const addResult = useCallback(async (result: TradeResult) => {
    try {
      const updated = await api.recordResult(result)
      setRiskState(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record result')
    }
  }, [api])

  const resetPause = useCallback(async () => {
    try {
      const updated = await api.patchRiskState({
        capitalBaseCents: riskState.capitalBaseCents,
      })
      setRiskState({ ...updated, last3Results: [], pauseUntil: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset')
    }
  }, [api, riskState.capitalBaseCents])

  const saveCapital = useCallback(async () => {
    const cents = Math.round((parseFloat(capInput) || 0) * 100)
    if (cents > 0) {
      try {
        const updated = await api.patchRiskState({ capitalBaseCents: cents })
        setRiskState(updated)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update capital base')
      }
    }
    setEditCap(false)
  }, [capInput, api])

  const addPosition = useCallback(async () => {
    const qty = parseInt(aForm.qty)
    const costCents = Math.round((parseFloat(aForm.costDollars) || 0) * 100)
    if (!aForm.ticker || qty <= 0 || costCents <= 0) return
    try {
      const created = await api.addPosition({
        ticker: aForm.ticker.toUpperCase(),
        qty,
        avgCostCents: costCents,
        sleeve: 'stock',
        sector: aForm.sector,
        openedAt: TODAY,
      })
      setPositions(prev => [...prev, created])
      setAForm({ ticker: '', qty: '', costDollars: '', sector: SECTORS[0] })
      setShowAdd(false)
      setEodResult(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add position')
    }
  }, [aForm, api])

  const removePosition = useCallback(async (id: number, priceInput?: string) => {
    const priceCents = priceInput
      ? Math.round((parseFloat(priceInput) || 0) * 100)
      : 0
    if (priceCents <= 0) {
      // No price input — just remove locally (user hasn't entered a close price)
      setPositions(prev => prev.filter(p => p.id !== id))
      setEodResult(null)
      return
    }
    try {
      const pos = positions.find(p => p.id === id)
      const result: TradeResult = pos && priceCents > pos.avgCostCents ? 'win' : 'loss'
      const { newRiskState } = await api.closePosition(id, priceCents, result)
      setPositions(prev => prev.filter(p => p.id !== id))
      setRiskState(newRiskState)
      setEodResult(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close position')
    }
  }, [api])

  const runEod = useCallback(async () => {
    const priceMap: Record<string, number> = {}
    for (const [ticker, val] of Object.entries(priceInputs)) {
      const cents = Math.round((parseFloat(val) || 0) * 100)
      if (cents > 0) priceMap[ticker] = cents
    }
    try {
      const result = await api.runEodEval(priceMap)
      setEodResult(result)
      // Re-fetch positions to get updated peak prices
      const updated = await api.fetchPositions('stock')
      setPositions(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'EOD evaluation failed')
    }
  }, [priceInputs, api])

  const checkGate = useCallback(() => {
    const price = Math.round((parseFloat(gForm.priceDollars) || 0) * 100)
    const qty = parseInt(gForm.qty)
    if (!gForm.ticker || price <= 0 || qty <= 0) return
    const proposal: EntryProposal = {
      ticker: gForm.ticker.toUpperCase(),
      proposedCostCents: price,
      proposedQty: qty,
      sector: gForm.sector,
      sleeve: 'stock',
      earningsWithin7d: gForm.earnings,
    }
    setGateResult(checkEntryGate(proposal, positions, riskState, TODAY))
  }, [gForm, positions, riskState])

  const sizingResult = useMemo(() => {
    const price = Math.round((parseFloat(gForm.priceDollars) || 0) * 100)
    if (!gForm.ticker || price <= 0) return null
    return computePositionSize(riskState.capitalBaseCents, positions, gForm.ticker.toUpperCase(), gForm.sector, price, regime)
  }, [gForm.ticker, gForm.priceDollars, gForm.sector, positions, riskState.capitalBaseCents, regime])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.view}>

      {/* ── Error banner ── */}
      {error && (
        <div className={styles.pauseBanner} style={{ borderColor: 'var(--color-loss, #ff5252)' }}>
          <div className={styles.pauseIcon}>⚠️</div>
          <div className={styles.pauseBody}>
            <div className={styles.pauseTitle} style={{ color: 'var(--color-loss, #ff5252)' }}>錯誤</div>
            <div className={styles.pauseDetail}>{error}</div>
          </div>
          <button className={styles.pauseResetBtn} onClick={() => setError(null)}>關閉</button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className={styles.emptyRow}>載入中…</div>
      )}

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>股票買賣策略</span>
          {snapshotLoading
            ? <span className={styles.regimePillLoading}>載入中…</span>
            : <span className={`${styles.regimePill} ${styles[REGIME_PILL[regime]]}`}>
                {REGIME_LABEL[regime]}
              </span>
          }
        </div>
        <div className={styles.headerRight}>
          {editCap ? (
            <div className={styles.capEditRow}>
              <span className={styles.capDollar}>$</span>
              <input
                className={styles.capInput}
                type="number" min="0" step="1000" placeholder="64000"
                autoFocus
                value={capInput}
                onChange={e => setCapInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveCapital()}
              />
              <button className={styles.capSaveBtn} onClick={saveCapital}>✓</button>
            </div>
          ) : (
            <button className={styles.capBtn} onClick={() => { setCapInput((riskState.capitalBaseCents / 100).toFixed(0)); setEditCap(true) }}>
              本金 {fmtDollar(riskState.capitalBaseCents)}
            </button>
          )}
        </div>
      </div>

      {/* ── Pause banner ── */}
      {paused && (
        <div className={styles.pauseBanner}>
          <div className={styles.pauseIcon}>⛔</div>
          <div className={styles.pauseBody}>
            <div className={styles.pauseTitle}>系統暫停進場</div>
            <div className={styles.pauseDetail}>三連敗觸發 · 暫停至 {riskState.pauseUntil}</div>
          </div>
          <button className={styles.pauseResetBtn} onClick={resetPause}>重置</button>
        </div>
      )}

      {/* ── Last 3 results ── */}
      <div className={styles.resultsCard}>
        <div className={styles.resultsHeader}>
          <span className={styles.resultsTitle}>最近 3 筆</span>
          <div className={styles.resultsChips}>
            {riskState.last3Results.map((r, i) => (
              <span key={i} className={`${styles.resultChip} ${r === 'win' ? styles.chipWin : styles.chipLoss}`}>
                {r === 'win' ? 'W' : 'L'}
              </span>
            ))}
            {riskState.last3Results.length === 0 && <span className={styles.resultsEmpty}>暫無記錄</span>}
          </div>
        </div>
        <div className={styles.resultsBtns}>
          <button className={styles.addWinBtn} onClick={() => addResult('win')}>＋ 盈利</button>
          <button className={styles.addLossBtn} onClick={() => addResult('loss')}>＋ 虧損</button>
          <button className={styles.clearBtn} onClick={resetPause}>清除</button>
        </div>
      </div>

      {/* ── Open positions ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>持倉</span>
          <span className={styles.sectionCount}>{positions.length} / 15</span>
          <button className={styles.addBtn} onClick={() => setShowAdd(v => !v)}>
            {showAdd ? '取消' : '＋ 加入'}
          </button>
        </div>

        {showAdd && (
          <div className={styles.addCard}>
            <div className={styles.addRow}>
              <input className={styles.addInput} placeholder="AAPL" value={aForm.ticker}
                onChange={e => setAForm(f => ({ ...f, ticker: e.target.value }))} />
              <input className={styles.addInput} placeholder="股數" type="number" min="1" value={aForm.qty}
                onChange={e => setAForm(f => ({ ...f, qty: e.target.value }))} />
              <span className={styles.addDollar}>$</span>
              <input className={styles.addInput} placeholder="成本價" type="number" min="0" step="0.01" value={aForm.costDollars}
                onChange={e => setAForm(f => ({ ...f, costDollars: e.target.value }))} />
            </div>
            <div className={styles.addRow}>
              <select className={styles.addSelect} value={aForm.sector}
                onChange={e => setAForm(f => ({ ...f, sector: e.target.value }))}>
                {SECTORS.map(s => <option key={s}>{s}</option>)}
              </select>
              <button className={styles.addSaveBtn} onClick={addPosition}>加入持倉</button>
            </div>
          </div>
        )}

        {positions.length === 0 && !showAdd && (
          <div className={styles.emptyRow}>尚無持倉 · 按「＋ 加入」新增測試倉位</div>
        )}

        {positions.map(pos => {
          const curCents = Math.round((parseFloat(priceInputs[pos.ticker] ?? '') || 0) * 100)
          const hardStop = pos.avgCostCents * 0.90
          const trailStop = pos.peakPriceCents * 0.80
          const pnlCents = curCents > 0 ? (curCents - pos.avgCostCents) * pos.qty : null
          return (
            <div key={pos.id} className={styles.posRow}>
              <div className={styles.posLeft}>
                <span className={styles.posTicker}>{pos.ticker}</span>
                <span className={styles.posSub}>{pos.qty} 股 · {pos.sector}</span>
              </div>
              <div className={styles.posMid}>
                <div className={styles.posStops}>
                  <span className={styles.stopLabel}>成本</span>
                  <span className={styles.stopVal}>{fmtPrice(pos.avgCostCents)}</span>
                  <span className={styles.stopLabel}>硬止損</span>
                  <span className={styles.stopVal}>{fmtPrice(hardStop)}</span>
                  <span className={styles.stopLabel}>移動止損</span>
                  <span className={styles.stopVal}>{fmtPrice(trailStop)}</span>
                </div>
              </div>
              <div className={styles.posRight}>
                <div className={styles.priceInputWrap}>
                  <span className={styles.priceInputDollar}>$</span>
                  <input
                    className={styles.priceInput}
                    type="number" min="0" step="0.01" placeholder="現價"
                    value={priceInputs[pos.ticker] ?? ''}
                    onChange={e => setPriceInputs(p => ({ ...p, [pos.ticker]: e.target.value }))}
                  />
                </div>
                {pnlCents !== null && (
                  <span className={`${styles.posPnl} ${pnlCents >= 0 ? styles.pnlGain : styles.pnlLoss}`}>
                    {fmtDollar(pnlCents)} ({fmtPct((curCents - pos.avgCostCents) / pos.avgCostCents, true)})
                  </span>
                )}
              </div>
              <button className={styles.removeBtn} onClick={() => removePosition(pos.id, priceInputs[pos.ticker])}>✕</button>
            </div>
          )
        })}

        {positions.length > 0 && (
          <button className={styles.eodBtn} onClick={runEod}>執行 EOD 評估</button>
        )}
      </div>

      {/* ── EOD results ── */}
      {eodResult && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>EOD 出場行動</span>
            <span className={styles.sectionCount}>{eodResult.exitCards.length} 張</span>
          </div>

          {eodResult.exitCards.length === 0 ? (
            <div className={styles.cleanBanner}>
              <span className={styles.cleanIcon}>✓</span>
              <span className={styles.cleanText}>所有持倉均在止損位以上，無需行動</span>
            </div>
          ) : (
            eodResult.exitCards.map((card, i) => (
              <div key={i} className={`${styles.exitCard} ${card.action === 'REDUCE' ? styles.exitCardReduce : styles.exitCardSell}`}>
                <div className={styles.exitCardHeader}>
                  <span className={`${styles.exitBadge} ${card.action === 'REDUCE' ? styles.badgeReduce : styles.badgeSell}`}>
                    {card.action === 'REDUCE' ? '減持' : '賣出'}
                  </span>
                  <span className={styles.exitTicker}>{card.ticker}</span>
                  <span className={styles.exitQty}>{card.qtyToClose} 股</span>
                  <span className={styles.exitPrice}>@ {fmtPrice(card.currentPriceCents)}</span>
                  <span className={`${styles.exitPnl} ${card.pnlCents >= 0 ? styles.pnlGain : styles.pnlLoss}`}>
                    {fmtDollar(card.pnlCents)}
                  </span>
                </div>
                <div className={styles.exitRule}>
                  <span className={styles.exitRuleLabel}>{card.ruleDescription}</span>
                  <span className={styles.exitRuleDetail}>{card.ruleDetail}</span>
                </div>
              </div>
            ))
          )}

          {eodResult.sectors.some(s => s.overweight) && (
            <div className={styles.sectorWarn}>
              {eodResult.sectors.filter(s => s.overweight).map(s => (
                <span key={s.sector} className={styles.sectorWarnItem}>
                  {s.sector} {fmtPct(s.pct)} &gt; 25%
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Entry gate + sizing ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>進場閘 + Sizing</span>
        </div>

        <div className={styles.gateCard}>
          <div className={styles.gateRow}>
            <input className={styles.gateInput} placeholder="TSLA" value={gForm.ticker}
              onChange={e => setGForm(f => ({ ...f, ticker: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && checkGate()} />
            <div className={styles.gatePriceWrap}>
              <span className={styles.gateDollar}>$</span>
              <input className={styles.gateInput} placeholder="買入價" type="number" min="0" step="0.01" value={gForm.priceDollars}
                onChange={e => setGForm(f => ({ ...f, priceDollars: e.target.value }))} />
            </div>
            <input className={styles.gateInput} placeholder="股數" type="number" min="1" value={gForm.qty}
              onChange={e => setGForm(f => ({ ...f, qty: e.target.value }))} />
          </div>
          <div className={styles.gateRow}>
            <select className={styles.gateSelect} value={gForm.sector}
              onChange={e => setGForm(f => ({ ...f, sector: e.target.value }))}>
              {SECTORS.map(s => <option key={s}>{s}</option>)}
            </select>
            <label className={styles.earningsToggle}>
              <input type="checkbox" checked={gForm.earnings}
                onChange={e => setGForm(f => ({ ...f, earnings: e.target.checked }))} />
              <span>7 日內業績</span>
            </label>
            <button className={styles.checkGateBtn} onClick={checkGate}>檢查閘口</button>
          </div>
        </div>

        {/* Gate result */}
        {gateResult && (
          <div className={`${styles.gateResult} ${gateResult.approved ? styles.gateApproved : styles.gateBlocked}`}>
            <div className={styles.gateResultHeader}>
              <span className={styles.gateResultIcon}>{gateResult.approved ? '✓' : '✕'}</span>
              <span className={styles.gateResultLabel}>
                {gateResult.approved ? '通過 — 可進場' : '攔截 — 禁止進場'}
              </span>
            </div>
            {gateResult.violations.length > 0 && (
              <ul className={styles.violationList}>
                {gateResult.violations.map((v, i) => (
                  <li key={i} className={`${styles.violationItem} ${v.rule === 'EARNINGS_WINDOW' ? styles.violationWarn : styles.violationBlock}`}>
                    <span className={styles.vRule}>{v.description}</span>
                    <span className={styles.vDetail}>{v.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Sizing result */}
        {sizingResult && sizingResult.qty > 0 && (
          <div className={styles.sizingCard}>
            <div className={styles.sizingHeader}>
              <span className={styles.sizingTitle}>Sizing 建議</span>
              <span className={styles.sizingQty}>{sizingResult.qty} 股</span>
              <span className={styles.sizingVal}>{fmtDollar(sizingResult.sizingCents)}</span>
            </div>
            <div className={styles.sizingRows}>
              {[
                { label: '單股上限 10%', val: sizingResult.maxByStockCents, key: 'SINGLE_STOCK_LIMIT' },
                { label: '板塊上限 25%', val: sizingResult.maxBySectorCents, key: 'SECTOR_LIMIT' },
                { label: `現金底 ${regime === 'short_friendly' ? '30%' : regime === 'neutral' ? '15%' : '5%'}`, val: sizingResult.maxByCashCents, key: 'CASH_FLOOR' },
              ].map(row => (
                <div key={row.key} className={`${styles.sizingRow} ${row.key === sizingResult.bindingConstraint ? styles.sizingBinding : ''}`}>
                  <span className={styles.sizingRowLabel}>{row.label}</span>
                  <span className={styles.sizingRowVal}>{fmtDollar(row.val)}</span>
                  {row.key === sizingResult.bindingConstraint && <span className={styles.sizingBindBadge}>制約</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className={styles.footer}>
        純規則化風險管理，無回測 edge、無 ML。進場先跑兩週 paper 牆，通過後接駁真錢。
      </div>

    </div>
  )
}
