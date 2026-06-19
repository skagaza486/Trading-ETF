import { useApp, type ViewId } from './providers/AppContext'
import styles from './BottomNav.module.css'

type NavItem = { id: ViewId; icon: string; label: string }

const NAV_ITEMS: NavItem[] = [
  { id: 'market',   icon: '🌡️', label: '大市' },
  { id: 'sectors',  icon: '🗺️', label: '板塊' },
  { id: 'discover', icon: '⭐', label: '發現' },
  { id: 'lab',      icon: '🔬', label: '研究室' },
]

export function BottomNav() {
  const { view, prevView, setView, mode } = useApp()
  const activeId = view === 'detail' ? prevView : view

  const items = mode === 'pro'
    ? NAV_ITEMS
    : NAV_ITEMS.filter(i => i.id !== 'lab')

  return (
    <nav className={styles.nav}>
      {items.map(item => (
        <button
          key={item.id}
          className={activeId === item.id ? styles.itemActive : styles.item}
          onClick={() => setView(item.id)}
        >
          <span className={styles.icon}>{item.icon}</span>
          <span className={styles.label}>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
