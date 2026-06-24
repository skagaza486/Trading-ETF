import type { ReactNode } from 'react'
import { usePortfolioStore } from '../portfolio/usePortfolioStore'
import { useSignalStats } from '../../shared/hooks/useSignalStats'
import styles from './NavHub.module.css'

export type NavTone = 'gain' | 'neutral' | 'warn'

export function NavHubList({ children }: { children: ReactNode }) {
  return <div className={styles.list}>{children}</div>
}

// 首頁 Navigation Hub 摘要卡:圖示 + 標題 + 一行數據摘要 + 箭頭,撳到去對應頁面。
// 把首頁原本「借來的」整段內容(板塊熱力圖／發現清單／戰績)壓縮成入口。
export function NavHubCard({
  icon, title, summary, meta, tone = 'neutral', onClick,
}: {
  icon: string
  title: string
  summary: ReactNode
  meta: string
  tone?: NavTone
  onClick: () => void
}) {
  const toneClass = tone === 'gain' ? styles.iconGain : tone === 'warn' ? styles.iconWarn : styles.iconNeutral
  return (
    <button className={styles.card} onClick={onClick}>
      <span className={`${styles.icon} ${toneClass}`}>{icon}</span>
      <span className={styles.body}>
        <span className={styles.titleRow}>
          <strong>{title}</strong>
        </span>
        <span className={styles.summary}>{summary}</span>
        <span className={styles.meta}>{meta}</span>
      </span>
      <span className={styles.arrow}>→</span>
    </button>
  )
}

// 組合卡 — 只讀 localStorage store(usePortfolioStore),不觸發 live price fetch。
export function PortfolioNavCard({ onClick }: { onClick: () => void }) {
  const { positions } = usePortfolioStore()

  if (positions.length === 0) {
    return (
      <NavHubCard
        icon="💼" title="組合" tone="neutral"
        summary="未有持倉 — 設定你的組合"
        meta="記錄持倉、止損同風險限額"
        onClick={onClick}
      />
    )
  }

  const noStop = positions.filter(p => p.stopLoss == null).length
  return (
    <NavHubCard
      icon="💼" title="組合"
      tone={noStop > 0 ? 'warn' : 'gain'}
      summary={`${positions.length} 持倉${noStop > 0 ? ` · ${noStop} 未設止損` : ''}`}
      meta={noStop > 0 ? '有持倉未設止損,留意風險' : '你的持倉同風險'}
      onClick={onClick}
    />
  )
}

// 驗證卡 — 複用 useSignalStats(90) 的加權戰績(同 SignalTrackRecord 一致),
// 進攻三類訊號按樣本數加權;樣本不足刻意不顯示回報數字。進階模式才顯示。
const TRACK_LABELS = ['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE']
const TRACK_MIN_SAMPLE = 30

export function VerifyNavCard({ onClick }: { onClick: () => void }) {
  const stats = useSignalStats(90)

  let summary = '戰績載入中…'
  let tone: NavTone = 'neutral'

  if (stats.status === 'ok') {
    const rows = stats.stats.filter(s => TRACK_LABELS.includes(s.label))
    const totalN = rows.reduce((sum, r) => sum + r.n, 0)
    const weighted = (pick: (s: (typeof rows)[number]) => number | null): number | null => {
      let num = 0, den = 0
      for (const r of rows) {
        const v = pick(r)
        if (v !== null) { num += v * r.n; den += r.n }
      }
      return den > 0 ? num / den : null
    }
    if (totalN < TRACK_MIN_SAMPLE) {
      summary = `樣本累積中（${totalN}）`
    } else {
      const winRate = weighted(s => s.winRate)
      const avg5d = weighted(s => s.avgRet5d)
      const winTxt = winRate !== null ? `勝率 ${winRate.toFixed(0)}%` : '勝率 —'
      const avgTxt = avg5d !== null ? `平均 ${avg5d >= 0 ? '+' : ''}${avg5d.toFixed(1)}%` : '平均 —'
      summary = `90 天 ${winTxt} · ${avgTxt}`
      tone = (avg5d ?? 0) > 0 ? 'gain' : 'neutral'
    }
  } else if (stats.status === 'error') {
    summary = '戰績暫時無法載入'
  }

  return (
    <NavHubCard
      icon="📈" title="驗證" tone={tone}
      summary={summary}
      meta="看漲訊號的實際結算戰績"
      onClick={onClick}
    />
  )
}
