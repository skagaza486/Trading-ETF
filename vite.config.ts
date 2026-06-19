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

function attachLocalProxyMiddlewares(
  server: { middlewares: { use: (path: string, handler: (req: unknown, res: unknown) => void | Promise<void>) => void } },
  finnhubApiKey: string | undefined
) {
  server.middlewares.use('/api/yahoo', async (req, res) => {
    const request = req as { url?: string }
    const response = res as {
      statusCode: number
      setHeader: (name: string, value: string) => void
      end: (body: string) => void
    }
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

      response.statusCode = 200
      response.setHeader('Content-Type', 'application/json;charset=utf-8')
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.end(body)
    } catch (error) {
      response.statusCode = 502
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Yahoo proxy request failed'
        })
      )
    }
  })

  server.middlewares.use('/api/fred', async (req, res) => {
    const request = req as { url?: string }
    const response = res as {
      statusCode: number
      setHeader: (name: string, value: string) => void
      end: (body: string) => void
    }
    const upstreamPath = request.url ?? '/'
    const upstreamUrl = `https://fred.stlouisfed.org${upstreamPath}`

    try {
      const body = await fetchTextWithCurl(upstreamUrl)
      response.statusCode = 200
      response.setHeader('Content-Type', 'text/csv;charset=utf-8')
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.end(body)
    } catch (error) {
      response.statusCode = 502
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'FRED proxy request failed'
        })
      )
    }
  })

  server.middlewares.use('/api/finnhub', async (req, res) => {
    const response = res as {
      statusCode: number
      setHeader: (name: string, value: string) => void
      end: (body: string) => void
    }
    const apiKey = finnhubApiKey

    if (!apiKey) {
      response.statusCode = 503
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ error: 'FINNHUB_API_KEY is not configured' }))
      return
    }

    const request = req as { url?: string }
    const upstreamPath = request.url ?? '/'
    const upstreamUrl = new URL(`https://finnhub.io/api/v1${upstreamPath}`)
    upstreamUrl.searchParams.set('token', apiKey)

    try {
      const body = await fetchFinnhubWithCurl(upstreamUrl.toString())
      response.statusCode = 200
      response.setHeader('Content-Type', 'application/json;charset=utf-8')
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.end(body)
    } catch (error) {
      response.statusCode = 502
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Finnhub proxy request failed'
        })
      )
    }
  })
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
          attachLocalProxyMiddlewares(server, finnhubApiKey)
        },
        configurePreviewServer(server) {
          attachLocalProxyMiddlewares(server, finnhubApiKey)
        }
      }
    ],
    server: {
      proxy: {
        '/api/snapshot': 'https://trading-etf.skagaza486.workers.dev',
        '/api/d1':       'https://trading-etf.skagaza486.workers.dev',
      }
    },
    build: {
      rollupOptions: {
        input: {
          main: 'index.html',
          legacy: 'legacy.html'
        }
      }
    }
  }
})
