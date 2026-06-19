import { useState, useEffect } from 'react'
import { fetchDailySnapshot } from '../../../services/marketData/snapshotProvider'
import type { DailySnapshot } from '../../../types/snapshot'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; snapshot: DailySnapshot; stale: boolean }

export function useSnapshot() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchDailySnapshot().then(result => {
      if (cancelled) return
      if (result.status === 'error') {
        setState({ status: 'error', message: result.message })
      } else {
        setState({ status: 'ok', snapshot: result.snapshot, stale: result.stale })
      }
    }).catch(err => {
      if (!cancelled) setState({ status: 'error', message: String(err) })
    })
    return () => { cancelled = true }
  }, [])

  return state
}
