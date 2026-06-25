import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSnapshot } from '../../../web/shared/hooks/useSnapshot'
import {
  computeRebalance,
  computeTargetWeights,
  ETF_UNIVERSE,
  ETF_META,
  DRIFT_BAND,
  type EtfTicker,
  type EtfHolding,
} from '../../../engine/etfAllocEngine'
import { useCapitalApi } from '../../shared/hooks/useCapitalApi'
import type { RiskState } from '../../../types/capital'
import styles from './EtfView.module.css'

// ── localStorage persistence ──────────────────────────────────────────────────

const STORAGE_KEY = 'capital-etf-holdings'

type StoredHoldings = Partial<Record<EtfTicker, string>>  // dollar string inputs

function loadHoldings(): StoredHoldings {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveHoldings(h: StoredHoldings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(h))
}

function toHoldingCents(stored: StoredHoldings): EtfHolding[] {
  return ETF_UNIVERSE.map(ticker => ({
    ticker,
    valueCents: Math.round((parseFloat(stored[ticker] ?? '0') || 0) * 100),
  }))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const REGIME_LABEL: Record<string, string> = {
  long_friendly:  '偏多',
  neutral:        '中性',
  short_friendly: '防守',
}

const REGIME_PILL: Record<string, string> = {
  long_friendly:  'pillGreen',
  neutral:        'pillYellow',
  short_friendly: 'pillRed',
}

function fmtUsd(cents: number): string {
  const dollars = cents / 100
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`
  return `$${dollars.toFixed(0)}`
}

function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

function driftColor(drift: number, exceedsBand: boolean): string {
  if (!exceedsBand) return styles.driftNeutral
  return drift > 0 ? styles.driftHigh : styles.driftLow
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EtfView() {
  const { snapshot, loading } = useSnapshot()
  const api = useCapitalApi()
  const [storedHoldings, setStoredHoldings] = useState<StoredHoldings>(loadHoldings)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<StoredHoldings>({})
  const [riskState, setRiskState] = useState<RiskState | null>(null)

  const regime = snapshot?.regime ?? riskState?.regime ?? 'neutral'
  const holdings = useMemo(() => toHoldingCents(storedHoldings), [storedHoldings])
  const result = useMemo(() => computeRebalance(holdings, regime), [holdings, regime])
  const targets = useMemo(() => computeTargetWeights(regime), [regime])

  // Fetch risk state from capital API on mount
  useEffect(() => {
    api.fetchRiskState().then(setRiskState).catch(() => {})
  }, [api])

  const hasAnyHolding = holdings.some(h => h.valueCents > 0)

  const startEdit = useCallback(() => {
    setDraft({ ...storedHoldings })
    setIsEditing(true)
  }, [storedHoldings])

  const saveEdit = useCallback(() => {
    saveHoldings(draft)
    setStoredHoldings(draft)
    setIsEditing(false)
  }, [draft])

  const cancelEdit = useCallback(() => {
    setIsEditing(false)
    setDraft({})
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.view}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>ETF 自動配置</span>
          {loading
            ? <span className={styles.regimePillLoading}>載入中…</span>
            : <span className={`${styles.regimePill} ${styles[REGIME_PILL[regime]]}`}>
                {REGIME_LABEL[regime]}
              </span>
          }
          {riskState && (
            <span className={styles.capBaseLabel}>
              本金 {fmtUsd(riskState.capitalBaseCents)}
            </span>
          )}
        </div>
        <button className={styles.editBtn} onClick={isEditing ? cancelEdit : startEdit}>
          {isEditing ? '取消' : '編輯持倉'}
        </button>
      </div>

      {/* ── Target weights card ── */}
      <div className={styles.targetsCard}>
        <div className={styles.targetsHeader}>
          <span className={styles.targetsTitle}>目標配置</span>
          <span className={styles.targetsNote}>偏移帶 ±{fmtPct(DRIFT_BAND)}</span>
        </div>
        <div className={styles.targetGrid}>
          {ETF_UNIVERSE.map(ticker => (
            <div key={ticker} className={styles.targetCell}>
              <span className={styles.targetTicker}>{ticker}</span>
              <span className={styles.targetPct}>{fmtPct(targets[ticker])}</span>
              <span className={styles.targetRole}>{ETF_META[ticker].role}</span>
            </div>
          ))}
        </div>
        {regime !== 'long_friendly' && (
          <div className={styles.regimeNote}>
            {regime === 'short_friendly'
              ? '防守模式：SGOV 提升至 30%，股票 ETF 按比例縮減'
              : '中性模式：SGOV 提升至 15%，股票 ETF 按比例縮減'}
          </div>
        )}
      </div>

      {/* ── Edit form ── */}
      {isEditing && (
        <div className={styles.editCard}>
          <div className={styles.editTitle}>輸入現持倉（美元）</div>
          <div className={styles.editGrid}>
            {ETF_UNIVERSE.map(ticker => (
              <div key={ticker} className={styles.editRow}>
                <label className={styles.editLabel}>{ticker}</label>
                <div className={styles.editInputWrap}>
                  <span className={styles.editDollar}>$</span>
                  <input
                    className={styles.editInput}
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    value={draft[ticker] ?? ''}
                    onChange={e => setDraft(prev => ({ ...prev, [ticker]: e.target.value }))}
                  />
                </div>
              </div>
            ))}
          </div>
          <button className={styles.saveBtn} onClick={saveEdit}>儲存</button>
        </div>
      )}

      {/* ── No holdings prompt ── */}
      {!hasAnyHolding && !isEditing && (
        <div className={styles.emptyCard}>
          <div className={styles.emptyIcon}>📊</div>
          <div className={styles.emptyTitle}>尚未輸入持倉</div>
          <div className={styles.emptyDesc}>點擊「編輯持倉」輸入各 ETF 現值，即可查看偏移分析與再平衡建議。</div>
          <button className={styles.editBtnLarge} onClick={startEdit}>輸入持倉</button>
        </div>
      )}

      {/* ── Allocation analysis ── */}
      {hasAnyHolding && !isEditing && (
        <>
          <div className={styles.analysisCard}>
            <div className={styles.analysisHeader}>
              <span className={styles.analysisTitle}>配置分析</span>
              <span className={styles.analysisTotal}>
                總值 {fmtUsd(result.totalValueCents)}
              </span>
            </div>
            <div className={styles.allocList}>
              {result.allocations.map(a => (
                <div key={a.ticker} className={styles.allocRow}>
                  <div className={styles.allocLeft}>
                    <span className={styles.allocTicker}>{a.ticker}</span>
                    <span className={styles.allocRole}>{ETF_META[a.ticker].role}</span>
                  </div>
                  <div className={styles.allocBars}>
                    {/* Target bar (ghost) */}
                    <div className={styles.barWrap}>
                      <div
                        className={styles.barTarget}
                        style={{ width: `${a.targetPct * 100}%` }}
                      />
                      <div
                        className={`${styles.barCurrent} ${a.exceedsDriftBand ? styles.barExceeds : ''}`}
                        style={{ width: `${a.currentPct * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className={styles.allocRight}>
                    <span className={styles.allocCurrentPct}>{fmtPct(a.currentPct)}</span>
                    <span className={`${styles.allocDrift} ${driftColor(a.drift, a.exceedsDriftBand)}`}>
                      {a.drift > 0 ? '+' : ''}{fmtPct(a.drift)}
                    </span>
                  </div>
                  {a.exceedsDriftBand && (
                    <div className={`${styles.allocAction} ${a.action === 'BUY' ? styles.actionBuy : styles.actionSell}`}>
                      {a.action === 'BUY' ? '買入' : '賣出'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Rebalance cards ── */}
          {result.needsRebalance ? (
            <div className={styles.rebalanceSection}>
              <div className={styles.rebalanceHeader}>
                <span className={styles.rebalanceTitle}>再平衡行動</span>
                <span className={styles.rebalanceCount}>{result.cards.length} 張</span>
              </div>
              {result.cards.map(card => (
                <div
                  key={card.ticker}
                  className={`${styles.rebalanceCard} ${card.action === 'BUY' ? styles.cardBuy : styles.cardSell}`}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.cardAction}>{card.action === 'BUY' ? '買入' : '賣出'}</span>
                    <span className={styles.cardTicker}>{card.ticker}</span>
                    <span className={styles.cardAmount}>{fmtUsd(card.amountCents)}</span>
                  </div>
                  <div className={styles.cardReason}>{card.reason}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.balancedBanner}>
              <span className={styles.balancedIcon}>✓</span>
              <span className={styles.balancedText}>配置均衡，無需再平衡（所有 ETF 偏移均在 ±{fmtPct(DRIFT_BAND)} 內）</span>
            </div>
          )}
        </>
      )}

      {/* ── Footer note ── */}
      <div className={styles.footer}>
        純算術再平衡，無回測 edge、無 ML。偏移帶觸發，非按時間表。
      </div>

    </div>
  )
}
