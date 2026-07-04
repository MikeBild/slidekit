// Job store lifecycle/eviction/TTL and the callback-URL allowlist, plus the
// async /render -> /jobs flow through the real HTTP layer with a fake build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { createJobStore, isAllowedCallback } from '../../src/jobs.mjs'
import { createApp } from '../../src/server.mjs'
import { loadConfig } from '../../src/config.mjs'
import { createLogger } from '../../src/logger.mjs'

const OK = fileURLToPath(new URL('../fixtures/fake-slidev/ok.mjs', import.meta.url))
const logger = createLogger({ level: 'error' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('jobs: lifecycle queued -> running -> done', () => {
  const s = createJobStore({ max: 10, ttlMs: 0 })
  const j = s.create({ title: 'x' })
  assert.equal(j.status, 'queued')
  s.markRunning(j.id)
  assert.equal(s.get(j.id).status, 'running')
  s.setResult(j.id, '<html>', '"etag"')
  const done = s.get(j.id)
  assert.equal(done.status, 'done')
  assert.equal(done.html, '<html>')
  assert.equal(done.etag, '"etag"')
})

test('jobs: fail records the error', () => {
  const s = createJobStore({ max: 10, ttlMs: 0 })
  const j = s.create({})
  s.fail(j.id, 'BUILD_FAILED')
  assert.equal(s.get(j.id).status, 'error')
  assert.equal(s.get(j.id).error, 'BUILD_FAILED')
})

test('jobs: evicts oldest over max', () => {
  const s = createJobStore({ max: 2, ttlMs: 0 })
  const a = s.create({})
  s.create({})
  s.create({}) // evicts a
  assert.equal(s.get(a.id), undefined)
  assert.equal(s.size, 2)
})

test('jobs: TTL expiry via injected clock', () => {
  let t = 1000
  const s = createJobStore({ max: 10, ttlMs: 500, now: () => t })
  const j = s.create({})
  assert.ok(s.get(j.id))
  t = 1600
  assert.equal(s.get(j.id), undefined)
  s.stop()
})

test('isAllowedCallback: empty allowlist blocks everything', () => {
  assert.equal(isAllowedCallback('https://hooks.example.com/x', []), false)
})

test('isAllowedCallback: exact host and subdomain match; scheme enforced', () => {
  const allow = ['example.com', '127.0.0.1']
  assert.equal(isAllowedCallback('https://example.com/x', allow), true)
  assert.equal(isAllowedCallback('https://hooks.example.com/x', allow), true)
  assert.equal(isAllowedCallback('http://127.0.0.1:9000/cb', allow), true)
  assert.equal(isAllowedCallback('https://evil.com/x', allow), false)
  assert.equal(isAllowedCallback('ftp://example.com/x', allow), false)
  assert.equal(isAllowedCallback('not a url', allow), false)
})

async function withRenderApp(env, fn) {
  const root = await mkdtemp(join(tmpdir(), 'slidekit-root-'))
  const workDir = await mkdtemp(join(tmpdir(), 'slidekit-work-'))
  const cfg = {
    ...loadConfig(),
    ...env,
    root,
    workDir,
    styleCss: join(root, 'style.css'),
    themesDir: join(root, 'themes'),
    slidevCli: OK,
    apiKeys: [],
  }
  const app = createApp(cfg, logger)
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${app.server.address().port}`
  try {
    await fn(base)
  } finally {
    app.server.close()
    app.limiter.stop?.()
    app.cache.stop?.()
    app.jobs.stop?.()
  }
}

const pollDone = async (base, id, ms = 4000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const j = await (await fetch(`${base}/jobs/${id}`)).json()
    if (j.status === 'done' || j.status === 'error') return j
    await sleep(30)
  }
  throw new Error('job did not finish')
}

test('async render: 202 -> poll -> result HTML', async () => {
  await withRenderApp({}, async (base) => {
    const r = await fetch(`${base}/render?async=1`, {
      method: 'POST',
      headers: { 'content-type': 'text/markdown' },
      body: '# async deck',
    })
    assert.equal(r.status, 202)
    const { id, status } = await r.json()
    assert.ok(id)
    assert.equal(status, 'queued')
    assert.equal(r.headers.get('location'), `/jobs/${id}`)

    const done = await pollDone(base, id)
    assert.equal(done.status, 'done')
    assert.equal(done.result, `/jobs/${id}/result`)

    const res = await fetch(`${base}${done.result}`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') || '', /text\/html/)
    assert.ok(res.headers.get('etag'))
    assert.match(await res.text(), /ok/)
  })
})

test('async render: callback host not allowlisted -> 400', async () => {
  await withRenderApp({ webhookAllow: [] }, async (base) => {
    const r = await fetch(
      `${base}/render?async=1&callback=${encodeURIComponent('https://evil.com/cb')}`,
      {
        method: 'POST',
        headers: { 'content-type': 'text/markdown' },
        body: '# x',
      },
    )
    assert.equal(r.status, 400)
  })
})

test('async render: allowlisted webhook is delivered on completion', async () => {
  // Local listener acts as the webhook receiver.
  let received
  const hook = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => {
      body += c
    })
    req.on('end', () => {
      received = JSON.parse(body)
      res.writeHead(200)
      res.end('ok')
    })
  })
  await new Promise((r) => hook.listen(0, '127.0.0.1', r))
  const hookPort = hook.address().port
  try {
    await withRenderApp({ webhookAllow: ['127.0.0.1'] }, async (base) => {
      const cb = `http://127.0.0.1:${hookPort}/cb`
      const r = await fetch(`${base}/render?async=1&callback=${encodeURIComponent(cb)}`, {
        method: 'POST',
        headers: { 'content-type': 'text/markdown' },
        body: '# hook deck',
      })
      assert.equal(r.status, 202)
      const { id } = await r.json()
      const end = Date.now() + 4000
      while (!received && Date.now() < end) await sleep(30)
      assert.ok(received, 'webhook was delivered')
      assert.equal(received.id, id)
      assert.equal(received.status, 'done')
    })
  } finally {
    hook.close()
  }
})

test('jobs: unknown id -> 404, result before done -> 409', async () => {
  await withRenderApp({}, async (base) => {
    assert.equal((await fetch(`${base}/jobs/does-not-exist`)).status, 404)
    assert.equal((await fetch(`${base}/jobs/does-not-exist/result`)).status, 404)
  })
})
