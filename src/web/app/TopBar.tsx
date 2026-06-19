import { useApp, type MarketScope, type UiMode } from './providers/AppContext'
import styles from './TopBar.module.css'

export function TopBar() {
  const { scope, setScope, mode, setMode } = useApp()

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.logo}>市場羅盤</span>
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
