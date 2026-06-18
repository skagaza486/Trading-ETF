import type { DailySnapshot } from '../../types/snapshot'

export type SnapshotResult =
  | { status: 'ok'; snapshot: DailySnapshot; stale: boolean; ageMinutes: number }
  | { status: 'unavailable'; reason: string }

// Max age before we treat the snapshot as too stale to use (> 25h covers Mon AM using Fri's snapshot)
const MAX_STALE_MS = 1000 * 60 * 60 * 25

export async function fetchDailySnapshot(): Promise<SnapshotResult> {
  try {
    const response = await fetch('/api/snapshot/latest')

    if (response.status === 404) {
      return { status: 'unavailable', reason: 'Snapshot not yet generated — cron has not run.' }
    }

    if (response.status === 503) {
      return { status: 'unavailable', reason: 'KV not configured on this deployment.' }
    }

    if (!response.ok) {
      return { status: 'unavailable', reason: `Snapshot endpoint returned ${response.status}` }
    }

    const snapshot = (await response.json()) as DailySnapshot
    const ageMs = Date.now() - new Date(snapshot.generatedAt).getTime()
    const stale = ageMs > MAX_STALE_MS

    return {
      status: 'ok',
      snapshot,
      stale,
      ageMinutes: Math.round(ageMs / 60000)
    }
  } catch {
    return { status: 'unavailable', reason: 'Network error fetching snapshot.' }
  }
}

export function isSnapshotFresh(result: SnapshotResult): result is Extract<SnapshotResult, { status: 'ok'; stale: false }> {
  return result.status === 'ok' && !result.stale
}
