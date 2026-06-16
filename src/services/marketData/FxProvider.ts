import type { FxRate } from '../../types/fx'

export interface FxProvider {
  getUsdHkd(): Promise<FxRate>
}
