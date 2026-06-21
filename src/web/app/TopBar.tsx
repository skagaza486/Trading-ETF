import { useApp, type MarketScope, type UiMode } from './providers/AppContext'
import { useSnapshot } from '../shared/hooks/useSnapshot'
import styles from './TopBar.module.css'

function fmtUpdated(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${min}`
}

export function TopBar() {
  const { scope, setScope, mode, setMode } = useApp()
  const snap = useSnapshot()
  const regime = snap.status === 'ok' ? snap.snapshot.regime : null
  const updatedAt = snap.status === 'ok' ? snap.snapshot.generatedAt : null

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.logo}>市場羅盤</span>
        {regime && (
          <span
            className={styles.regimeDot}
            style={{
              background: regime === 'long_friendly' ? 'var(--color-gain)'
                : regime === 'short_friendly' ? 'var(--color-loss)'
                : 'var(--color-warn)'
            }}
            title={regime === 'long_friendly' ? '偏多環境' : regime === 'short_friendly' ? '偏空環境' : '震盪環境'}
          />
        )}
        {updatedAt && (
          <span className={styles.updatedAt} title={`資料生成：${updatedAt}`}>
            更新 {fmtUpdated(updatedAt)}
          </span>
        )}
      </div>

      <div className={styles.controls}>
        <ScopeToggle value={scope} onChange={setScope} />
        <ModeToggle value={mode} onChange={setMode} />
      </div>
    </header>
  )
}

function ScopeToggle({ value, onChange }: { value: MarketScope; onChange: (s: MarketScope) => void }) {
  return (
    <div className={styles.toggle}>
      <button
        className={value === 'US' ? styles.toggleActive : styles.toggleBtn}
        onClick={() => onChange('US')}
      >
        🇺🇸 美股
      </button>
      <button
        className={value === 'HK' ? styles.toggleActive : styles.toggleBtn}
        onClick={() => onChange('HK')}
      >
        🇭🇰 港股
      </button>
    </div>
  )
}

function ModeToggle({ value, onChange }: { value: UiMode; onChange: (m: UiMode) => void }) {
  return (
    <button
      className={styles.modeBtn}
      onClick={() => onChange(value === 'simple' ? 'pro' : 'simple')}
      title={value === 'simple' ? '切換至進階模式' : '切換至簡易模式'}
    >
      {value === 'simple' ? '簡易' : '進階'}
    </button>
  )
}
