import type { ETFIndicatorSnapshot, ETFLabel } from './signal'

export type ETFReplayWeek = {
  weekEndingDate: string
  ticker: string
  label: ETFLabel
  indicators: ETFIndicatorSnapshot
  ret1w: number | null
  ret4w: number | null
}
