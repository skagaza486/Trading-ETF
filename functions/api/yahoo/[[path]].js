export async function onRequest(context) {
  const url = new URL(context.request.url)
  const subpath = url.pathname.replace(/^\/api\/yahoo/, '')
  const target = `https://query1.finance.yahoo.com${subpath}${url.search}`

  let response = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    }
  })

  // query1 occasionally returns 429; fall back to query2
  if (response.status === 429 || response.status === 403) {
    const fallback = `https://query2.finance.yahoo.com${subpath}${url.search}`
    response = await fetch(fallback, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    })
  }

  const body = await response.text()

  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    }
  })
}
