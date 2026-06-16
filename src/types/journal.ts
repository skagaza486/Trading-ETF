import type { SignalAction } from './signal'

export type JournalEntryStatus = 'EXECUTED' | 'IGNORED'

export type JournalEntry = {
  id: string
  date: string
  action: SignalAction
  ticker: string
  amountHkd?: number
  price?: number
  reason: string
  regime: string
  sourceSignalId?: string
  status: JournalEntryStatus
  notes?: string
}
