import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const yahooUserAgent = 'Mozilla/5.0'

async function fetchYahooWithCurl(upstreamUrl: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'curl',
    ['-fsSL', '-A', yahooUserAgent, upstreamUrl],
    { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }
  )

  return stdout
}

async function fetchTextWithCurl(upstreamUrl: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'curl',
    ['--http1.1', '-fsSL', '-A', 'Mozilla/5.0', upstreamUrl],
    { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
  )

  return stdout
}

async function fetchFinnhubWithCurl(upstreamUrl: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'curl',
    ['--http1.1', '-fsSL', '-A', 'Mozilla/5.0', upstreamUrl],
    { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }
  )

  return stdout
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const finnhubApiKey = env.FINNHUB_API_KEY || process.env.FINNHUB_API_KEY

  return {
    plugins: [
      react(),
      {
        name: 'local-yahoo-finance-proxy',
        configureServer(server) {
        server.middlewares.use('/api/yahoo', async (req, res) => {
          const request = req as { url?: string }
          const upstreamPath = request.url ?? '/'
          const query1Url = `https://query1.finance.yahoo.com${upstreamPath}`
          const query2Url = `https://query2.finance.yahoo.com${upstreamPath}`

          try {
            let body: string
            try {
              body = await fetchYahooWithCurl(query1Url)
            } catch {
              body = await fetchYahooWithCurl(query2Url)
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json;charset=utf-8')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(body)
          } catch (error) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : 'Yahoo proxy request failed'
              })
            )
          }
        })
        server.middlewares.use('/api/fred', async (req, res) => {
          const request = req as { url?: string }
          const upstreamPath = request.url ?? '/'
          const upstreamUrl = `https://fred.stlouisfed.org${upstreamPath}`

          try {
            const body = await fetchTextWithCurl(upstreamUrl)
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/csv;charset=utf-8')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(body)
          } catch (error) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : 'FRED proxy request failed'
              })
            )
          }
        })
        server.middlewares.use('/api/finnhub', async (req, res) => {
          const apiKey = finnhubApiKey

          if (!apiKey) {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'FINNHUB_API_KEY is not configured' }))
            return
          }

          const request = req as { url?: string }
          const upstreamPath = request.url ?? '/'
          const upstreamUrl = new URL(`https://finnhub.io/api/v1${upstreamPath}`)
          upstreamUrl.searchParams.set('token', apiKey)

          try {
            const body = await fetchFinnhubWithCurl(upstreamUrl.toString())
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json;charset=utf-8')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(body)
          } catch (error) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : 'Finnhub proxy request failed'
              })
            )
          }
        })
        }
      }
    ]
  }
})
