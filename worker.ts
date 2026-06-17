export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/yahoo')) {
      return handleYahoo(url)
    }

    if (url.pathname.startsWith('/api/finnhub')) {
      return handleFinnhub(env, url)
    }

    return env.ASSETS.fetch(request)
  }
}

async function handleYahoo(url: URL): Promise<Response> {
  const subpath = url.pathname.replace(/^\/api\/yahoo/, '')
  const targets = [
    `https://query1.finance.yahoo.com${subpath}${url.search}`,
    `https://query2.finance.yahoo.com${subpath}${url.search}`
  ]

  let lastError: Error | null = null
  for (const target of targets) {
    try {
      const response = await fetch(target, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
      })
      if (!response.ok) throw new Error(`Yahoo returned ${response.status}`)
      const body = await response.text()
      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=1800'
        }
      })
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Yahoo fetch failed')
    }
  }

  return new Response(JSON.stringify({ error: lastError?.message ?? 'Yahoo proxy failed' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
}

async function handleFinnhub(env: Env, url: URL): Promise<Response> {
  const apiKey = env.FINNHUB_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'FINNHUB_API_KEY not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }

  const subpath = url.pathname.replace(/^\/api\/finnhub/, '')
  const target = new URL(`https://finnhub.io/api/v1${subpath}${url.search}`)
  target.searchParams.set('token', apiKey)

  const response = await fetch(target, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
  })

  const body = await response.text()
  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}

interface Env {
  FINNHUB_API_KEY: string
  ASSETS: Fetcher
}
