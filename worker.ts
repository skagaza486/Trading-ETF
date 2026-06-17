export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/finnhub')) {
      return handleFinnhub(request, env, url)
    }

    return env.ASSETS.fetch(request)
  }
}

async function handleFinnhub(request: Request, env: Env, url: URL): Promise<Response> {
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
