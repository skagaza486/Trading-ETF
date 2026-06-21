import { useApp } from './providers/AppContext'
import { TopBar } from './TopBar'
import { BottomNav } from './BottomNav'
import { Onboarding } from '../features/onboarding/Onboarding'
import { MarketView } from '../features/market/MarketView'
import { SectorsView } from '../features/sectors/SectorsView'
import { DiscoverView } from '../features/discover/DiscoverView'
import { DetailView } from '../features/detail/DetailView'
import { LabView } from '../features/lab/LabView'
import { RedesignShowcase } from '../features/showcase/RedesignShowcase'
import styles from './App.module.css'

export function App() {
  const { view, onboardingDone } = useApp()
  const showcase = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('showcase')
    : null

  if (showcase === 'redesign') return <RedesignShowcase />

  if (!onboardingDone) return <Onboarding />

  return (
    <div className={styles.shell}>
      <TopBar />
      <main className={styles.content}>
        {view === 'market'   && <MarketView />}
        {view === 'sectors'  && <SectorsView />}
        {view === 'discover' && <DiscoverView />}
        {view === 'detail'   && <DetailView />}
        {view === 'lab'      && <LabView />}
      </main>
      <BottomNav />
    </div>
  )
}
