export async function onRequest(context) {
  const apiKey = context.env?.FINNHUB_API_KEY

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'FINNHUB_API_KEY is not configured' }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  const url = new URL(context.request.url)
  const subpath = url.pathname.replace(/^\/api\/finnhub/, '')
  const target = new URL(`https://finnhub.io/api/v1${subpath}${url.search}`)
  target.searchParams.set('token', apiKey)

  const response = await fetch(target, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0'
    }
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
