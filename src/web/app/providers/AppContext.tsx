import { createContext, useContext, useState, type ReactNode } from 'react'

export type MarketScope = 'US' | 'HK'
export type UiMode = 'simple' | 'pro'
export type ViewId = 'market' | 'sectors' | 'discover' | 'detail' | 'lab'

export type DetailTarget = { ticker: string; name: string }

type AppContextValue = {
  scope: MarketScope
  setScope: (s: MarketScope) => void
  mode: UiMode
  setMode: (m: UiMode) => void
  view: ViewId
  setView: (v: ViewId) => void
  detailTarget: DetailTarget | null
  openDetail: (t: DetailTarget) => void
  closeDetail: () => void
  onboardingDone: boolean
  completeOnboarding: (scope: MarketScope, mode: UiMode) => void
}

const AppContext = createContext<AppContextValue | null>(null)

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}

function save<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<MarketScope>(() => load('web:scope', 'US'))
  const [mode, setModeState] = useState<UiMode>(() => load('web:mode', 'simple'))
  const [view, setViewState] = useState<ViewId>('market')
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null)
  const [onboardingDone, setOnboardingDone] = useState<boolean>(() => load('web:onboarded', false))

  const setScope = (s: MarketScope) => { setScopeState(s); save('web:scope', s) }
  const setMode  = (m: UiMode)      => { setModeState(m);  save('web:mode', m) }
  const setView  = (v: ViewId)      => { setViewState(v); setDetailTarget(null) }

  const openDetail = (t: DetailTarget) => {
    setDetailTarget(t)
    setViewState('detail')
  }
  const closeDetail = () => {
    setDetailTarget(null)
    setViewState('discover')
  }

  const completeOnboarding = (s: MarketScope, m: UiMode) => {
    setScope(s); setMode(m)
    setOnboardingDone(true)
    save('web:onboarded', true)
  }

  return (
    <AppContext.Provider value={{
      scope, setScope, mode, setMode,
      view, setView,
      detailTarget, openDetail, closeDetail,
      onboardingDone, completeOnboarding
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProviders')
  return ctx
}
