const stockLogoModules = import.meta.glob('../assets/logos/stocks/*.{png,svg}', {
  eager: true,
  import: 'default'
}) as Record<string, string>

const uiAssetModules = import.meta.glob('../assets/ui/**/*.{svg,png}', {
  eager: true,
  import: 'default'
}) as Record<string, string>

function fileStem(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? filePath
  return fileName.replace(/\.(png|svg)$/i, '')
}

function buildRegistry(modules: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(modules).map(([filePath, assetUrl]) => [fileStem(filePath), assetUrl])
  )
}

const stockLogoRegistry = buildRegistry(stockLogoModules)
const uiAssetRegistry = buildRegistry(uiAssetModules)

export function getStockLogoAsset(ticker: string): string | null {
  return stockLogoRegistry[ticker] ?? null
}

export function getUiAsset(name: string): string | null {
  return uiAssetRegistry[name] ?? null
}

export const stockLogoAssetCount = Object.keys(stockLogoRegistry).length
export const uiAssetCount = Object.keys(uiAssetRegistry).length
