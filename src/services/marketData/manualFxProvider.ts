import type { FxProvider } from './FxProvider'
import type { FxRate } from '../../types/fx'

export class ManualFxProvider implements FxProvider {
  constructor(private readonly rate = 7.78) {}

  async getUsdHkd(): Promise<FxRate> {
    return {
      pair: 'USDHKD',
      rate: this.rate,
      fetchedAt: new Date().toISOString(),
      isManualOverride: true,
      isStale: false,
      source: 'MANUAL'
    }
  }
}
