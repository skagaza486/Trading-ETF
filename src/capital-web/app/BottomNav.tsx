import type { CapitalView } from './App'
import styles from './BottomNav.module.css'

type Tab = { id: CapitalView; icon: string; label: string; badge?: string }

const TABS: Tab[] = [
  { id: 'market',  icon: '📡', label: '市場概覽' },
  { id: 'etf',     icon: '⚖️', label: 'ETF 配置' },
  { id: 'stocks',  icon: '📋', label: '股票策略' },
  { id: 'paper',   icon: '📝', label: 'Paper 牆' },
]

type Props = { active: CapitalView; onSwitch: (v: CapitalView) => void }

export function BottomNav({ active, onSwitch }: Props) {
  return (
    <nav className={styles.nav}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`${styles.tab} ${active === tab.id ? styles.active : ''}`}
          onClick={() => onSwitch(tab.id)}
        >
          <span className={styles.icon}>{tab.icon}</span>
          <span className={styles.label}>{tab.label}</span>
          {tab.badge && <span className={styles.badge}>{tab.badge}</span>}
        </button>
      ))}
    </nav>
  )
}
