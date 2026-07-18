// End-to-end cache + ETag behaviour through the real HTTP layer, using a fake
// `slidev` build so no real Slidev/Vite runs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from '../../src/server.mjs'
import { loadConfig } from '../../src/config.mjs'
import { createLogger } from '../../src/logger.mjs'

const OK = fileURLToPath(new URL('../fixtures/fake-slidev/ok.mjs', import.meta.url))
const logger = createLogger({ level: 'error' })

async function withRenderApp(fn) {
  const root = await mkdtemp(join(tmpdir(), 'slidekit-root-'))
  const workDir = await mkdtemp(join(tmpdir(), 'slidekit-work-'))
  const cfg = {
    ...loadConfig(),
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
  }
}

const render = (base, body, headers = {}) =>
  fetch(`${base}/render`, {
    method: 'POST',
    headers: { 'content-type': 'text/markdown', ...headers },
    body,
  })

test('render: identical requests share an ETag and hit the cache (one build)', async () => {
  await withRenderApp(async (base) => {
    const r1 = await render(base, '# same deck')
    assert.equal(r1.status, 200)
    const etag = r1.headers.get('etag')
    assert.ok(etag, 'ETag present on 200')
    await r1.text()

    const r2 = await render(base, '# same deck')
    assert.equal(r2.status, 200)
    assert.equal(r2.headers.get('etag'), etag, 'same input -> same ETag')
    await r2.text()

    const metrics = await (await fetch(`${base}/metrics`)).text()
    assert.match(metrics, /slidekit_builds_total\{result="success"\} 1\b/, 'built exactly once')
    assert.match(metrics, /slidekit_cache_hits_total 1\b/)
    assert.match(metrics, /slidekit_cache_misses_total 1\b/)
  })
})

test('render: If-None-Match matching the ETag -> 304', async () => {
  await withRenderApp(async (base) => {
    const r1 = await render(base, '# deck')
    const etag = r1.headers.get('etag')
    await r1.text()

    const r2 = await render(base, '# deck', { 'if-none-match': etag })
    assert.equal(r2.status, 304)
    assert.equal(r2.headers.get('etag'), etag)
    assert.equal((await r2.text()).length, 0, '304 has no body')
  })
})
