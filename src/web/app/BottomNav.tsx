import { useApp, type ViewId } from './providers/AppContext'
import { useSnapshot } from '../shared/hooks/useSnapshot'
import { useWatchlist } from '../shared/hooks/useWatchlist'
import styles from './BottomNav.module.css'

type NavItem = { id: ViewId; icon: string; label: string }

const NAV_ITEMS: NavItem[] = [
  { id: 'market',   icon: '🌡️', label: '大市' },
  { id: 'sectors',  icon: '🗺️', label: '板塊' },
  { id: 'discover', icon: '⭐', label: '發現' },
  { id: 'portfolio', icon: '💼', label: '組合' },
  { id: 'lab',      icon: '🔬', label: '研究室' },
]

export function BottomNav() {
  const { view, prevView, setView, mode } = useApp()
  const snap = useSnapshot()
  const { starred } = useWatchlist()
  const activeId = view === 'detail' ? prevView : view

  const hasStarredChanges = snap.status === 'ok'
    ? snap.snapshot.stocks.some(s =>
        starred.has(s.ticker) &&
        s.previousLabel !== undefined &&
        s.previousLabel !== s.label
      )
    : false

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
          <span className={styles.iconWrap}>
            <span className={styles.icon}>{item.icon}</span>
            {item.id === 'discover' && hasStarredChanges && (
              <span className={styles.badge} />
            )}
          </span>
          <span className={styles.label}>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
