import { useState } from 'react'
import { BottomNav } from './BottomNav'
import { MarketContextView } from '../features/market-context/MarketContextView'
import { EtfView } from '../features/etf/EtfView'
import { StocksView } from '../features/stocks/StocksView'
import { PaperWallView } from '../features/paper-wall/PaperWallView'
import styles from './App.module.css'

export type CapitalView = 'market' | 'etf' | 'stocks' | 'paper'

const TOKEN_KEY = 'capital-auth-token'

export function App() {
  const [view, setView] = useState<CapitalView>('market')
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '')
  const [tokenDraft, setTokenDraft] = useState('')

  const hasToken = token.length > 0

  const saveToken = () => {
    const t = tokenDraft.trim()
    if (t) {
      localStorage.setItem(TOKEN_KEY, t)
      setToken(t)
      setTokenDraft('')
    }
  }

  if (!hasToken) {
    return (
      <div className={styles.shell}>
        <main className={styles.content} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>Capital Manager</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 300 }}>
            Capital API 需要 Bearer token 認證（防止未授權存取）。
            請輸入 Token，只需輸入一次（儲存在 localStorage）。
          </p>
          <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 320 }}>
            <input
              type="password"
              placeholder="輸入 API Token"
              value={tokenDraft}
              onChange={e => setTokenDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveToken()}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <button
              onClick={saveToken}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--accent)',
                color: '#000',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              確認
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <main className={styles.content}>
        {view === 'market'  && <MarketContextView />}
        {view === 'etf'     && <EtfView />}
        {view === 'stocks'  && <StocksView />}
        {view === 'paper'   && <PaperWallView />}
      </main>
      <BottomNav active={view} onSwitch={setView} />
    </div>
  )
}
