import { useState } from 'react'
import { useSignalStats } from '../../shared/hooks/useSignalStats'
import styles from './LabView.module.css'

const LABEL_ZH: Record<string, string> = {
  LONG_BREAK:  '突破',
  LONG_VCP:    'VCP 突破',
  LONG_BOUNCE: 'EMA 反彈',
  LONG_BASE:   '整固等待',
  WATCH:       '觀察中',
  NEUTRAL:     '無方向',
  AVOID_CHOP:  '震盪迴避',
  SHORT_BREAK: '空頭突破',
  SHORT_BASE:  '空頭整固',
  SHORT_WATCH: '空頭觀察',
}

const LABEL_ORDER = ['LONG_BREAK','LONG_VCP','LONG_BOUNCE','LONG_BASE','WATCH','NEUTRAL','AVOID_CHOP','SHORT_WATCH','SHORT_BASE','SHORT_BREAK']
const BULL_LABELS = new Set(['LONG_BREAK','LONG_VCP','LONG_BOUNCE','LONG_BASE'])
const BEAR_LABELS = new Set(['SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP'])

const DAYS_OPTIONS = [30, 90, 180] as const
type DaysOpt = (typeof DAYS_OPTIONS)[number]

function pct(v: number | null, decimals = 1): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

function pctColor(v: number | null): string | undefined {
  if (v === null) return undefined
  return v > 0 ? 'var(--color-gain)' : v < 0 ? 'var(--color-loss)' : undefined
}

export function LabView() {
  const [days, setDays] = useState<DaysOpt>(90)
  const statsState = useSignalStats(days)

  const sortedStats = statsState.status === 'ok'
    ? [...statsState.stats].sort((a, b) => {
        const ai = LABEL_ORDER.indexOf(a.label)
        const bi = LABEL_ORDER.indexOf(b.label)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })
    : []

  return (
    <div className={styles.view}>
      {/* Signal stats */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>信號表現統計</h2>
          <div className={styles.daysTabs}>
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                className={days === d ? styles.dayActive : styles.dayBtn}
                onClick={() => setDays(d)}
              >
                {d}日
              </button>
            ))}
          </div>
        </div>

        {statsState.status === 'loading' && (
          <div className={styles.loading}>載入中…</div>
        )}
        {statsState.status === 'error' && (
          <div className={styles.error}>無法載入統計資料</div>
        )}
        {statsState.status === 'ok' && (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.thLabel}>信號</th>
                    <th className={styles.th}>次數</th>
                    <th className={styles.th}>勝率</th>
                    <th className={styles.th}>5日均報</th>
                    <th className={styles.th}>vs SPY</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStats.map(s => {
                    const isBull = BULL_LABELS.has(s.label)
                    const isBear = BEAR_LABELS.has(s.label)
                    return (
                      <tr key={s.label} className={isBull ? styles.rowBull : isBear ? styles.rowBear : styles.row}>
                        <td className={styles.tdLabel}>{LABEL_ZH[s.label] ?? s.label}</td>
                        <td className={styles.td}>{s.n.toLocaleString()}</td>
                        <td className={styles.td} style={{ color: pctColor(s.winRate ? s.winRate - 50 : null) }}>
                          {s.winRate !== null ? `${s.winRate.toFixed(0)}%` : '—'}
                        </td>
                        <td className={styles.td} style={{ color: pctColor(s.avgRet5d) }}>{pct(s.avgRet5d)}</td>
                        <td className={styles.td} style={{ color: pctColor(s.avgVsSpy) }}>{pct(s.avgVsSpy)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>
              統計期：{statsState.since} 起，共 {sortedStats.reduce((a, b) => a + b.n, 0).toLocaleString()} 筆已結算信號（含 5 日實際回報）。研究參考，非投資建議。
            </p>
          </>
        )}
      </section>

      {/* Legacy app link */}
      <section className={styles.legacySection}>
        <h3 className={styles.legacyTitle}>進階研究室</h3>
        <p className={styles.legacyDesc}>ETF Replay、Stock Replay、Gate 驗證等功能仍在舊版介面。</p>
        <a href="/legacy.html" target="_blank" rel="noopener noreferrer" className={styles.btn}>
          開啟研究室（舊版）↗
        </a>
      </section>
    </div>
  )
}
