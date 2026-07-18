// Fast middleware tests: exercise auth / body-cap / rate-limit / probes through
// the real HTTP layer without triggering a Slidev build (all these paths
// short-circuit before the build).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import zlib from 'node:zlib'
import { loadConfig } from '../../src/config.mjs'
import { createApp } from '../../src/server.mjs'
import { createLogger } from '../../src/logger.mjs'

const ENV = [
  'SLIDEKIT_API_KEYS',
  'SLIDEKIT_ANALYTICS_STATE_PATH',
  'SLIDEKIT_RATE_LIMIT_MAX',
  'SLIDEKIT_MAX_BODY_BYTES',
  'SLIDEKIT_REQUIRE_AUTH_ALL',
  'SLIDEKIT_CORS_ORIGIN',
  'SLIDEKIT_COMPRESSION',
]
let appNumber = 0

// Raw GET that does NOT auto-decompress (unlike fetch), so we can assert encoding.
function rawGet(base, path, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(base + path)
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', headers },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
        )
      },
    )
    req.on('error', reject)
    req.end()
  })
}

async function withApp(env, fn) {
  const saved = {}
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  process.env.SLIDEKIT_ANALYTICS_STATE_PATH = `/tmp/slidekit-stats-test-${process.pid}-${appNumber++}.json`
  const app = createApp(loadConfig(), createLogger({ level: 'error' }))
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${app.server.address().port}`
  try {
    await fn(app, base)
  } finally {
    app.server.close()
    app.limiter.stop?.()
    app.jobs.stop?.()
    await app.stats.flush()
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
}

test('POST /render without API key -> 401', async () => {
  await withApp({ SLIDEKIT_API_KEYS: 'k' }, async (_app, base) => {
    const r = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'content-type': 'text/markdown' },
      body: '# x',
    })
    assert.equal(r.status, 401)
    assert.match(r.headers.get('www-authenticate') || '', /Bearer/)
  })
})

test('POST /render with oversized body -> 413', async () => {
  await withApp({ SLIDEKIT_API_KEYS: 'k', SLIDEKIT_MAX_BODY_BYTES: '20' }, async (_app, base) => {
    const r = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'content-type': 'text/markdown', authorization: 'Bearer k' },
      body: '# this body is definitely longer than twenty bytes',
    })
    assert.equal(r.status, 413)
  })
})

test('POST /render over the rate limit -> 429', async () => {
  await withApp({ SLIDEKIT_API_KEYS: 'k', SLIDEKIT_RATE_LIMIT_MAX: '1' }, async (_app, base) => {
    const opts = {
      method: 'POST',
      headers: { 'content-type': 'text/markdown', authorization: 'Bearer k' },
      body: '',
    }
    const first = await fetch(`${base}/render`, opts) // empty -> 400, but consumes the one token
    assert.equal(first.status, 400)
    const second = await fetch(`${base}/render`, opts)
    assert.equal(second.status, 429)
    assert.ok(second.headers.get('retry-after'))
  })
})

test('GET /openapi.json is gzip-compressed on request', async () => {
  await withApp({}, async (_app, base) => {
    const r = await rawGet(base, '/openapi.json', { 'accept-encoding': 'gzip' })
    assert.equal(r.status, 200)
    assert.equal(r.headers['content-encoding'], 'gzip')
    assert.match(r.headers['vary'] || '', /Accept-Encoding/)
    assert.match(zlib.gunzipSync(r.body).toString('utf8'), /openapi/)
  })
})

test('compression can be disabled', async () => {
  await withApp({ SLIDEKIT_COMPRESSION: '0' }, async (_app, base) => {
    const r = await rawGet(base, '/openapi.json', { 'accept-encoding': 'gzip' })
    assert.equal(r.headers['content-encoding'], undefined)
  })
})

test('OPTIONS preflight -> 204 with CORS headers when an origin is configured', async () => {
  await withApp({ SLIDEKIT_CORS_ORIGIN: '*' }, async (_app, base) => {
    const r = await fetch(`${base}/render`, { method: 'OPTIONS' })
    assert.equal(r.status, 204)
    assert.equal(r.headers.get('access-control-allow-origin'), '*')
    assert.match(r.headers.get('access-control-allow-methods') || '', /POST/)
  })
})

test('unknown route: HTML 404 for browsers, plain text for API clients', async () => {
  await withApp({}, async (_app, base) => {
    const html = await fetch(`${base}/nope`, { headers: { accept: 'text/html' } })
    assert.equal(html.status, 404)
    assert.match(html.headers.get('content-type') || '', /text\/html/)
    assert.match(await html.text(), /404/)
    const api = await fetch(`${base}/nope`, { headers: { accept: 'application/json' } })
    assert.equal(api.status, 404)
    assert.match(api.headers.get('content-type') || '', /text\/plain/)
  })
})

test('every response carries an X-Request-Id', async () => {
  await withApp({}, async (_app, base) => {
    const r = await fetch(`${base}/health`)
    assert.ok(r.headers.get('x-request-id'), 'x-request-id present')
    assert.match(r.headers.get('traceparent') || '', /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
  })
})

test('build statistics reuse the service API key and return closed hourly buckets', async () => {
  await withApp({ SLIDEKIT_API_KEYS: 'existing-key' }, async (_app, base) => {
    const url = `${base}/v1/stats/builds?from=2026-07-18T05:00:00Z&to=2026-07-18T06:00:00Z`
    assert.equal((await fetch(url)).status, 401)
    const response = await fetch(url, { headers: { authorization: 'Bearer existing-key' } })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.service.name, 'slidekit')
    assert.equal(body.bucket, 'hour')
    assert.equal(body.rows.length, 1)
    assert.deepEqual(Object.keys(body.rows[0]).sort(), [
      'builds',
      'cache',
      'end',
      'jobs',
      'renders',
      'start',
    ])
  })
})

test('build statistics fail closed when service authentication is disabled', async () => {
  await withApp({}, async (_app, base) => {
    assert.equal((await fetch(`${base}/v1/stats/builds`)).status, 503)
  })
})

test('/health is public; /ready flips to 503 while draining', async () => {
  await withApp({ SLIDEKIT_API_KEYS: 'k', SLIDEKIT_REQUIRE_AUTH_ALL: '1' }, async (app, base) => {
    assert.equal((await fetch(`${base}/health`)).status, 200)
    const ready = await fetch(`${base}/ready`)
    assert.equal(ready.status, 200)
    assert.equal((await ready.json()).version, '1.3.0')
    app.state.draining = true
    assert.equal((await fetch(`${base}/ready`)).status, 503)
  })
})
