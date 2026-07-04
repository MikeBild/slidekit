// Composition root: HTTP routing, security middleware, and lifecycle.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { join } from 'node:path'
import zlib from 'node:zlib'

import { loadConfig } from './config.mjs'
import { createLogger } from './logger.mjs'
import { listThemes, resolveTheme } from './themes.mjs'
import { extractApiKey, createAuthChecker, fingerprint } from './auth.mjs'
import { createRateLimiter } from './ratelimit.mjs'
import { createBuildRunner, BuildError, sweepStale } from './build.mjs'
import { createCache } from './cache.mjs'
import { createJobStore, isAllowedCallback } from './jobs.mjs'
import { createMetrics } from './metrics.mjs'
import { parseMultipart } from './multipart.mjs'
import {
  ensureHashRouting,
  forceBaseTheme,
  stripExternals,
  injectMeta,
  metaFromQuery,
  sanitizeFilename,
} from './html-postprocess.mjs'
import { buildOpenApi } from './openapi.mjs'

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
}

// GET / — a machine-readable service descriptor (no human UI). Version is read
// from /openapi.json to avoid a second source of truth.
const SERVICE_DESCRIPTOR = JSON.stringify({
  name: 'slidekit',
  description: 'Markdown -> one self-contained Slidev HTML deck',
  render: '/render',
  openapi: '/openapi.json',
  themes: '/themes',
  llms: '/llms.txt',
  health: '/health',
})

// Self-contained (no external requests) HTML 404 for browser clients.
const notFoundHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 · slidekit</title><style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;background:#0b0b0c;color:#e7e7ea}main{max-width:34rem;padding:2rem;text-align:center}h1{font-size:3.5rem;margin:0 0 .25rem}code{background:#ffffff1a;padding:.15em .4em;border-radius:.35em}a{color:#5eead4}</style></head><body><main><h1>404</h1><p>Not found. slidekit turns Markdown into one self-contained Slidev deck.</p><p>POST Markdown to <code>/render</code> · spec at <a href="/openapi.json">/openapi.json</a> · docs at <a href="/llms.txt">/llms.txt</a></p></main></body></html>`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Deliver a job-completion webhook. Best-effort: one retry, short timeout, and
// failures only log — the job's own status is authoritative.
async function notifyWebhook(url, payload, logger) {
  const opts = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(5000) })
      if (res.ok) return
      throw new Error('status ' + res.status)
    } catch (e) {
      if (attempt === 1)
        logger.warn('webhook delivery failed', { url, err: String(e?.message || e) })
    }
  }
}

const COMPRESSIBLE = /^(?:text\/|application\/(?:json|javascript|xml|manifest\+json))/
const MIN_COMPRESS_BYTES = 1024

// Negotiate a response encoding from an Accept-Encoding header. Prefers gzip
// (universal, cheap) over deflate; br is opt-in via q since sync brotli is slow.
function pickEncoding(accept) {
  const a = String(accept || '').toLowerCase()
  if (/\bgzip\b/.test(a)) return 'gzip'
  if (/\bdeflate\b/.test(a)) return 'deflate'
  if (/\bbr\b/.test(a)) return 'br'
  return null
}

function compress(enc, buf) {
  if (enc === 'gzip') return zlib.gzipSync(buf)
  if (enc === 'deflate') return zlib.deflateSync(buf)
  if (enc === 'br') return zlib.brotliCompressSync(buf)
  return buf
}

function clientIp(req, trustProxy) {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for']
    if (xff) return String(xff).split(',')[0].trim()
  }
  return req.socket.remoteAddress || 'unknown'
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0
    let aborted = false
    const chunks = []
    req.on('data', (c) => {
      if (aborted) return
      size += c.length
      if (size > max) {
        aborted = true
        const e = new Error('body too large')
        e.code = 'TOO_LARGE'
        reject(e)
        req.resume() // drain the rest so the 413 response can be delivered
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (!aborted) resolve(Buffer.concat(chunks))
    })
    req.on('error', (e) => {
      if (!aborted) reject(e)
    })
  })
}

export function createApp(config, logger = createLogger(config)) {
  const auth = createAuthChecker(config.apiKeys)
  const limiter = createRateLimiter({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
  })
  const builds = createBuildRunner(config, logger)
  const cache = createCache({ max: config.cacheMax, ttlMs: config.cacheTtlMs })
  const jobs = createJobStore({ max: config.jobsMax, ttlMs: config.jobTtlMs })
  const metrics = createMetrics()
  const state = { draining: false }

  const sha256 = (s) => createHash('sha256').update(s).digest('hex')

  // Shared render pipeline used by both the sync and async (job) paths: cache
  // lookup -> build on miss -> per-request meta injection -> strong ETag.
  async function renderDeck(md, meta) {
    const prepared = ensureHashRouting(forceBaseTheme(md, config.baseTheme))
    const cacheKey = sha256(prepared + '|' + meta.theme)
    let rawHtml = cache.get(cacheKey)
    if (rawHtml !== undefined) {
      metrics.cacheHit()
    } else {
      metrics.cacheMiss()
      const t0 = Date.now()
      rawHtml = await builds.run(prepared, meta.theme) // may throw BuildError
      metrics.buildObserved(Date.now() - t0)
      cache.put(cacheKey, rawHtml)
    }
    const html = injectMeta(stripExternals(rawHtml), meta)
    return { html, etag: `"${sha256(html)}"` }
  }

  const deckHeaders = (meta, etag) => {
    const h = { 'content-type': 'text/html; charset=utf-8', etag }
    if (meta.download)
      h['content-disposition'] = `attachment; filename="${sanitizeFilename(meta.title)}.html"`
    return h
  }
  const notModified = (req, etag) => {
    const inm = req.headers['if-none-match']
    return inm && inm.split(',').some((t) => t.trim() === etag)
  }

  function sendBuildError(res, e) {
    if (e instanceof BuildError && (e.code === 'QUEUE_FULL' || e.code === 'QUEUE_TIMEOUT'))
      return send(res, 503, { 'content-type': 'text/plain', 'retry-after': '5' }, 'busy, try again')
    if (e instanceof BuildError && e.code === 'TIMEOUT')
      return send(res, 504, { 'content-type': 'text/plain' }, 'build timed out')
    logger.error('build failed', { err: String(e?.message || e).slice(0, 500) })
    return send(res, 500, { 'content-type': 'text/plain' }, 'build failed')
  }

  // Run a queued job to completion in the background, then fire the webhook (if
  // any). Never rejects — failures are recorded on the job and logged.
  function runJob(id, md, meta, callback) {
    jobs.markRunning(id)
    ;(async () => {
      try {
        const { html, etag } = await renderDeck(md, meta)
        jobs.setResult(id, html, etag)
      } catch (e) {
        jobs.fail(id, e instanceof BuildError ? e.code : 'BUILD_FAILED')
        logger.error('job build failed', { id, err: String(e?.message || e).slice(0, 300) })
      }
      if (callback) {
        const job = jobs.get(id)
        notifyWebhook(
          callback,
          { id, status: job?.status || 'gone', ...(job?.error ? { error: job.error } : {}) },
          logger,
        )
      }
    })()
  }

  const CORS = config.corsOrigin ? { 'access-control-allow-origin': config.corsOrigin } : {}

  function send(res, code, headers, body) {
    const h = { ...SECURITY_HEADERS, ...CORS, ...headers }
    let out = body
    // Content negotiation: gzip large, compressible text bodies. ETag is already
    // computed over the uncompressed body, so it stays stable across encodings.
    if (config.compression && out && code !== 204 && code !== 304) {
      const buf = Buffer.isBuffer(out) ? out : Buffer.from(String(out))
      if (buf.length >= MIN_COMPRESS_BYTES && COMPRESSIBLE.test(h['content-type'] || '')) {
        const enc = pickEncoding(res._acceptEncoding)
        if (enc) {
          out = compress(enc, buf)
          h['content-encoding'] = enc
          h['vary'] = 'Accept-Encoding'
        }
      }
    }
    res.writeHead(code, h)
    res.end(out)
  }

  async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const path = url.pathname
    const ip = clientIp(req, config.trustProxy)
    res._acceptEncoding = req.headers['accept-encoding']

    // CORS preflight (only meaningful when an origin is configured).
    if (req.method === 'OPTIONS') {
      const pf = config.corsOrigin
        ? {
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': 'authorization, x-api-key, content-type, if-none-match',
            'access-control-max-age': '600',
          }
        : {}
      return send(res, 204, pf, '')
    }

    // --- auth (per-route) ---
    const isProbe = path === '/health' || path === '/ready'
    const routeNeedsAuth =
      path === '/render' || path.startsWith('/jobs/') || (config.requireAuthAll && !isProbe)
    if (auth.enabled && routeNeedsAuth) {
      const key = extractApiKey(req.headers)
      if (!auth.check(key)) {
        logger.warn('unauthorized', { path, ip, key: fingerprint(key) })
        return send(
          res,
          401,
          { 'content-type': 'text/plain', 'www-authenticate': 'Bearer' },
          'unauthorized',
        )
      }
    }

    // --- rate limit (/render only) ---
    if (path === '/render' && limiter.enabled) {
      const id = (auth.enabled && extractApiKey(req.headers)) || ip
      const r = limiter.take(id)
      const rlHeaders = {
        'ratelimit-limit': String(r.limit),
        'ratelimit-remaining': String(r.remaining),
        'ratelimit-reset': String(Math.ceil(r.reset / 1000)),
      }
      if (!r.allowed) {
        logger.warn('rate limited', { ip })
        return send(
          res,
          429,
          { ...rlHeaders, 'content-type': 'text/plain', 'retry-after': String(r.retryAfter) },
          'rate limit exceeded',
        )
      }
      for (const [name, value] of Object.entries(rlHeaders)) res.setHeader(name, value)
    }

    // Static, cacheable GET responses (descriptor/themes/spec/docs) — safe to
    // cache briefly at the client/CDN since they only change on redeploy.
    const STATIC_CACHE = { 'cache-control': 'public, max-age=300' }

    // --- routes ---
    if (req.method === 'GET' && path === '/') {
      return send(
        res,
        200,
        { 'content-type': 'application/json', ...STATIC_CACHE },
        SERVICE_DESCRIPTOR,
      )
    }
    if (req.method === 'GET' && path === '/health') {
      // Liveness: the process is up. Stays 200 even while draining.
      return send(res, 200, { 'content-type': 'text/plain' }, 'ok')
    }
    if (req.method === 'GET' && path === '/ready') {
      // Readiness: accepting work. Flips to 503 during graceful shutdown so a
      // load balancer stops routing before in-flight builds are drained.
      if (state.draining)
        return send(
          res,
          503,
          { 'content-type': 'application/json' },
          JSON.stringify({ status: 'draining' }),
        )
      return send(
        res,
        200,
        { 'content-type': 'application/json' },
        JSON.stringify({ status: 'ready', inflight: builds.inflight() }),
      )
    }
    if (req.method === 'GET' && path === '/metrics') {
      return send(
        res,
        200,
        { 'content-type': 'text/plain; version=0.0.4' },
        metrics.render(builds.inflight()),
      )
    }
    if (req.method === 'GET' && path === '/themes') {
      return send(
        res,
        200,
        { 'content-type': 'application/json', ...STATIC_CACHE },
        JSON.stringify(await listThemes(config.themesDir)),
      )
    }
    if (req.method === 'GET' && path === '/openapi.json') {
      const spec = buildOpenApi(await listThemes(config.themesDir), {
        authEnabled: auth.enabled,
        defaultTheme: config.defaultTheme,
        version: config.version,
      })
      return send(
        res,
        200,
        { 'content-type': 'application/json', ...STATIC_CACHE },
        JSON.stringify(spec),
      )
    }
    if (req.method === 'GET' && (path === '/llms.txt' || path === '/llms-full.txt')) {
      // LLM-facing documentation (llmstxt.org). Served from the bundled docs dir.
      const txt = await readFile(join(config.docsDir, path.slice(1))).catch(() => null)
      if (!txt) return send(res, 404, { 'content-type': 'text/plain' }, 'not found')
      return send(res, 200, { 'content-type': 'text/plain; charset=utf-8', ...STATIC_CACHE }, txt)
    }
    if (req.method === 'POST' && path === '/render') {
      let raw
      try {
        raw = await readBody(req, config.maxBodyBytes)
      } catch (e) {
        if (e.code === 'TOO_LARGE')
          return send(res, 413, { 'content-type': 'text/plain' }, 'body too large')
        throw e
      }
      const ct = req.headers['content-type'] || ''
      let md
      if (ct.includes('multipart/form-data')) {
        md = parseMultipart(raw, ct)
        if (md == null)
          return send(res, 400, { 'content-type': 'text/plain' }, 'no markdown part in form-data')
      } else {
        md = raw.toString('utf8')
      }
      if (!md.trim()) return send(res, 400, { 'content-type': 'text/plain' }, 'empty markdown')

      const themes = await listThemes(config.themesDir)
      const meta = metaFromQuery(url, config.defaultTheme)
      meta.theme = resolveTheme(meta.theme, themes, config.defaultTheme)

      // Async mode: enqueue the build, return a job to poll instead of holding
      // the connection open for the whole (possibly queued) build.
      if (url.searchParams.get('async') === '1') {
        const callback = url.searchParams.get('callback') || ''
        if (callback && !isAllowedCallback(callback, config.webhookAllow)) {
          return send(
            res,
            400,
            { 'content-type': 'text/plain' },
            'callback host not allowed (set SLIDEKIT_WEBHOOK_ALLOW)',
          )
        }
        const job = jobs.create(meta)
        runJob(job.id, md, meta, callback)
        return send(
          res,
          202,
          { 'content-type': 'application/json', location: `/jobs/${job.id}` },
          JSON.stringify({ id: job.id, status: 'queued' }),
        )
      }

      let result
      try {
        result = await renderDeck(md, meta)
      } catch (e) {
        return sendBuildError(res, e)
      }
      // Strong-ETag revalidation: identical output -> 304, no body re-sent.
      if (notModified(req, result.etag)) return send(res, 304, { etag: result.etag }, '')
      return send(res, 200, deckHeaders(meta, result.etag), result.html)
    }

    // --- async job status + result ---
    if (req.method === 'GET' && path.startsWith('/jobs/')) {
      const [id, sub] = path.slice('/jobs/'.length).split('/')
      const job = id && jobs.get(id)
      if (!job) return send(res, 404, { 'content-type': 'text/plain' }, 'job not found')
      if (sub === 'result') {
        if (job.status === 'error')
          return send(res, 404, { 'content-type': 'text/plain' }, 'job failed')
        if (job.status !== 'done')
          return send(res, 409, { 'content-type': 'text/plain', 'retry-after': '2' }, 'not ready')
        if (notModified(req, job.etag)) return send(res, 304, { etag: job.etag }, '')
        return send(res, 200, deckHeaders(job.meta, job.etag), job.html)
      }
      if (sub) return send(res, 404, { 'content-type': 'text/plain' }, 'not found')
      const body = { id: job.id, status: job.status }
      if (job.status === 'done') body.result = `/jobs/${job.id}/result`
      if (job.status === 'error') body.error = job.error
      return send(res, 200, { 'content-type': 'application/json' }, JSON.stringify(body))
    }

    // Content-negotiated 404: a small self-contained HTML page for browsers,
    // plain text (with pointers) for API clients.
    if ((req.headers['accept'] || '').includes('text/html')) {
      return send(res, 404, { 'content-type': 'text/html; charset=utf-8' }, notFoundHtml)
    }
    return send(
      res,
      404,
      { 'content-type': 'text/plain' },
      'not found — POST markdown to /render; spec at /openapi.json; docs at /llms.txt',
    )
  }

  const server = createServer((req, res) => {
    const reqId = randomUUID().slice(0, 8)
    res.setHeader('x-request-id', reqId)
    const t0 = Date.now()
    res.on('finish', () => {
      const route = (req.url || '').split('?')[0]
      metrics.requestDone(route, res.statusCode)
      logger.info('request', {
        reqId,
        method: req.method,
        path: route,
        status: res.statusCode,
        ms: Date.now() - t0,
      })
    })
    handle(req, res).catch((e) => {
      logger.error('unhandled', { reqId, err: String(e?.message || e) })
      if (!res.headersSent) send(res, 500, { 'content-type': 'text/plain' }, 'internal error')
    })
  })

  // Cap how long a client may take to send headers/body — bounds slow-loris and
  // hung uploads that would otherwise hold a connection (and a build slot).
  if (config.requestTimeoutMs > 0) server.requestTimeout = config.requestTimeoutMs
  if (config.headersTimeoutMs > 0) server.headersTimeout = config.headersTimeoutMs

  return { server, builds, limiter, auth, state, metrics, cache, jobs }
}

export function start(config = loadConfig()) {
  const logger = createLogger({ level: config.logLevel, format: config.logFormat })
  const app = createApp(config, logger)

  // Clear leftovers from any previous crash, then optionally sweep periodically.
  sweepStale(config).catch((e) =>
    logger.warn('startup sweep failed', { err: String(e?.message || e) }),
  )
  let janitor
  if (config.janitorIntervalMs > 0) {
    janitor = setInterval(() => {
      sweepStale(config).catch(() => {})
    }, config.janitorIntervalMs)
    janitor.unref?.()
  }

  app.server.listen(config.port, config.host, () => {
    logger.info('slidekit listening', {
      url: `http://${config.host}:${config.port}`,
      auth: app.auth.enabled,
      rateLimit: app.limiter.enabled
        ? `${config.rateLimitMax}/${config.rateLimitWindowMs}ms`
        : 'off',
    })
    if (!app.auth.enabled)
      logger.warn(
        'auth disabled — set SLIDEKIT_API_KEYS before exposing this service (POST /render runs code; see SECURITY.md)',
      )
  })

  let shuttingDown = false
  async function shutdown(signal) {
    if (shuttingDown) return
    shuttingDown = true
    // 1) Fail readiness so a load balancer stops routing new requests.
    app.state.draining = true
    logger.info('draining', { signal, inflight: app.builds.inflight() })
    // 2) Stop accepting new connections.
    app.server.close()
    // 3) Wait for the in-flight build to finish (bounded by the grace period).
    const deadline = Date.now() + config.shutdownGraceMs
    while (app.builds.inflight() > 0 && Date.now() < deadline) await sleep(100)
    app.limiter.stop?.()
    app.cache.stop?.()
    app.jobs.stop?.()
    if (janitor) clearInterval(janitor)
    logger.info('shutdown complete', { signal })
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  return app
}
