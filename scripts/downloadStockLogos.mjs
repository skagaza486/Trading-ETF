import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const WATCHLIST_PATH = path.resolve('src/data/watchlist.ts')
const OUTPUT_DIR = path.resolve('src/assets/logos/stocks')
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json')
const LOGO_SOURCE_BASE = 'https://companiesmarketcap.com/img/company-logos/64'
const USER_AGENT = 'Mozilla/5.0 (compatible; PulseUIBot/1.0)'

const TICKER_ALIASES = {
  GOOGL: 'GOOG'
}

const SECTOR_COLORS = {
  Technology: ['#1AE4A4', '#10372F'],
  Communication: ['#25D3FF', '#102C3A'],
  Consumer: ['#FFD166', '#3B2E12'],
  'Consumer Discretionary': ['#FFD166', '#3B2E12'],
  'Consumer Staples': ['#C3F584', '#243617'],
  Financials: ['#4EC9FF', '#11283D'],
  HealthCare: ['#53F7BC', '#14362B'],
  'Health Care': ['#53F7BC', '#14362B'],
  Industrials: ['#F59E0B', '#38240E'],
  Energy: ['#FB7185', '#38141B'],
  Materials: ['#A78BFA', '#24173A'],
  Utilities: ['#F97316', '#3A1D10'],
  RealEstate: ['#60A5FA', '#162741'],
  'Real Estate': ['#60A5FA', '#162741'],
  International: ['#22D3EE', '#12343B'],
  Default: ['#3BE7A4', '#113128']
}

function normalizeTicker(ticker) {
  return TICKER_ALIASES[ticker] ?? ticker.replace(/\./g, '-')
}

function parseWatchlist(raw) {
  const pattern = /ticker:\s*'([^']+)'.*?sector:\s*'([^']+)'/g
  return [...raw.matchAll(pattern)].map((match) => ({
    ticker: match[1],
    sector: match[2]
  }))
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function buildFallbackSvg(ticker, sector) {
  const [accent, panel] = SECTOR_COLORS[sector] ?? SECTOR_COLORS.Default
  const fontSize = ticker.length >= 4 ? 18 : 22
  const safeTicker = escapeXml(ticker)

  return `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="4" width="56" height="56" rx="16" fill="#081310" stroke="#16352D" stroke-width="2"/>
  <rect x="10" y="10" width="44" height="44" rx="12" fill="${panel}"/>
  <path d="M14 48C18 42 23 39 29 39C35 39 39 34 43 28C46 23.5 49 19 54 16" stroke="${accent}" stroke-width="2.2" stroke-linecap="round" opacity="0.75"/>
  <text x="32" y="38" fill="#F3FBF8" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle" letter-spacing="0.04em">${safeTicker}</text>
</svg>\n`
}

async function fetchLogo(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT }
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    throw new Error(`Unexpected content-type: ${contentType}`)
  }

  return {
    contentType,
    bytes: Buffer.from(await response.arrayBuffer())
  }
}

async function downloadOrFallback({ ticker, sector }) {
  const sourceTicker = normalizeTicker(ticker)
  const sourceUrl = `${LOGO_SOURCE_BASE}/${sourceTicker}.png`

  try {
    const logo = await fetchLogo(sourceUrl)
    const outputPath = path.join(OUTPUT_DIR, `${ticker}.png`)
    await writeFile(outputPath, logo.bytes)
    return {
      ticker,
      sector,
      kind: 'downloaded',
      sourceUrl,
      file: `${ticker}.png`,
      contentType: logo.contentType
    }
  } catch (error) {
    const outputPath = path.join(OUTPUT_DIR, `${ticker}.svg`)
    await writeFile(outputPath, buildFallbackSvg(ticker, sector), 'utf8')
    return {
      ticker,
      sector,
      kind: 'fallback',
      sourceUrl,
      file: `${ticker}.svg`,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function main() {
  const raw = await readFile(WATCHLIST_PATH, 'utf8')
  const items = parseWatchlist(raw)
  await mkdir(OUTPUT_DIR, { recursive: true })

  const results = []
  for (let index = 0; index < items.length; index += 12) {
    const batch = items.slice(index, index + 12)
    results.push(...await Promise.all(batch.map(downloadOrFallback)))
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    downloaded: results.filter((item) => item.kind === 'downloaded').length,
    fallback: results.filter((item) => item.kind === 'fallback').length,
    sourceBase: LOGO_SOURCE_BASE,
    items: results
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({
    generatedAt: manifest.generatedAt,
    total: manifest.total,
    downloaded: manifest.downloaded,
    fallback: manifest.fallback
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
