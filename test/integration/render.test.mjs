// Slow end-to-end test: runs a real Slidev build. Gated behind RUN_INTEGRATION
// so `npm test` (unit) stays fast.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadConfig } from '../../src/config.mjs'
import { createApp } from '../../src/server.mjs'
import { createLogger } from '../../src/logger.mjs'

test(
  'POST /render returns one self-contained HTML deck',
  { skip: !process.env.RUN_INTEGRATION, timeout: 180000 },
  async () => {
    const app = createApp(loadConfig(), createLogger({ level: 'error' }))
    await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
    const { port } = app.server.address()
    try {
      const md = await readFile(new URL('../fixtures/minimal-deck.md', import.meta.url), 'utf8')
      const res = await fetch(`http://127.0.0.1:${port}/render?title=IntegrationTest`, {
        method: 'POST',
        headers: { 'content-type': 'text/markdown' },
        body: md,
      })
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.match(html, /<html/i)
      assert.match(html, /<style/i) // inline CSS
      assert.match(html, /<script/i) // inline JS
      assert.ok(
        !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html),
        'no external font requests',
      )
      assert.ok(!/<link\b[^>]*rel=["']?icon/i.test(html), 'no external favicon')
      assert.match(html, /routerMode:.?hash/, 'hash routing applied')
      assert.match(html, /<title>IntegrationTest<\/title>/)
    } finally {
      app.server.close()
      app.limiter.stop?.()
    }
  },
)
