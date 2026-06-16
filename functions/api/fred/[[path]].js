export async function onRequest(context) {
  const url = new URL(context.request.url)
  const subpath = url.pathname.replace(/^\/api\/fred/, '')
  const target = `https://fred.stlouisfed.org${subpath}${url.search}`

  const response = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/csv,*/*'
    }
  })

  const body = await response.text()

  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': 'text/csv',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
