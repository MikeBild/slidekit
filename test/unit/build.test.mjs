// Build-runner robustness: success + the three BuildError paths, queue overflow
// and queue-wait timeout, process-group kill on timeout, and the stale-file
// sweep. Uses fake `slidev` fixtures so no real Slidev/Vite build runs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, readdir, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBuildRunner, BuildError, sweepStale } from '../../src/build.mjs'
import { createLogger } from '../../src/logger.mjs'
import { createApp } from '../../src/server.mjs'
import { loadConfig } from '../../src/config.mjs'

const FIXTURES = fileURLToPath(new URL('../fixtures/fake-slidev/', import.meta.url))
const fixture = (name) => join(FIXTURES, name)
const logger = createLogger({ level: 'error' })

async function fakeConfig(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'slidekit-root-'))
  const workDir = await mkdtemp(join(tmpdir(), 'slidekit-work-'))
  return {
    root,
    workDir,
    styleCss: join(root, 'style.css'),
    slidevCli: fixture('ok.mjs'),
    defaultTheme: 'neutral',
    buildConcurrency: 1,
    buildQueueMax: 20,
    queueTimeoutMs: 30000,
    buildTimeoutMs: 120000,
    ...overrides,
  }
}

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const waitFor = async (cond, ms = 4000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await cond()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}

test('build: success returns the built HTML', async () => {
  const cfg = await fakeConfig()
  const runner = createBuildRunner(cfg, logger)
  const html = await runner.run('# hi', 'neutral')
  assert.match(html, /ok/)
})

test('build: non-zero exit -> BuildError BUILD_FAILED', async () => {
  const cfg = await fakeConfig({ slidevCli: fixture('exit-1.mjs') })
  const runner = createBuildRunner(cfg, logger)
  await assert.rejects(
    runner.run('# hi', 'neutral'),
    (e) => e instanceof BuildError && e.code === 'BUILD_FAILED',
  )
})

test('build: hung build -> TIMEOUT and the whole process group is killed', async () => {
  const pidFile = join(await mkdtemp(join(tmpdir(), 'slidekit-pid-')), 'gc.pid')
  process.env.SLIDEKIT_TEST_PIDFILE = pidFile
  try {
    const cfg = await fakeConfig({
      slidevCli: fixture('spawn-child-then-hang.mjs'),
      buildTimeoutMs: 800,
    })
    const runner = createBuildRunner(cfg, logger)
    await assert.rejects(
      runner.run('# hi', 'neutral'),
      (e) => e instanceof BuildError && e.code === 'TIMEOUT',
    )
    const gpid = Number(await readFile(pidFile, 'utf8'))
    assert.ok(gpid > 0, 'grandchild pid was recorded')
    const reaped = await waitFor(() => !alive(gpid))
    assert.ok(reaped, `grandchild pid ${gpid} should have been killed with the group`)
  } finally {
    delete process.env.SLIDEKIT_TEST_PIDFILE
  }
})

test('build: queue overflow -> BuildError QUEUE_FULL', async () => {
  const cfg = await fakeConfig({ slidevCli: fixture('slow.mjs'), buildQueueMax: 1 })
  process.env.SLIDEKIT_TEST_DELAY_MS = '400'
  try {
    const runner = createBuildRunner(cfg, logger)
    const a = runner.run('# a', 'neutral') // active
    const b = runner.run('# b', 'neutral') // queued (max 1)
    const c = runner.run('# c', 'neutral') // rejected
    await assert.rejects(c, (e) => e instanceof BuildError && e.code === 'QUEUE_FULL')
    await Promise.all([a, b])
  } finally {
    delete process.env.SLIDEKIT_TEST_DELAY_MS
  }
})

test('build: queue wait timeout -> BuildError QUEUE_TIMEOUT', async () => {
  const cfg = await fakeConfig({
    slidevCli: fixture('slow.mjs'),
    buildQueueMax: 5,
    queueTimeoutMs: 50,
  })
  process.env.SLIDEKIT_TEST_DELAY_MS = '600'
  try {
    const runner = createBuildRunner(cfg, logger)
    const a = runner.run('# a', 'neutral') // active for ~600ms
    const b = runner.run('# b', 'neutral') // queued, should time out after 50ms
    await assert.rejects(b, (e) => e instanceof BuildError && e.code === 'QUEUE_TIMEOUT')
    await a
  } finally {
    delete process.env.SLIDEKIT_TEST_DELAY_MS
  }
})

test('sweepStale: removes .deck-*.md from root and everything in workDir', async () => {
  const cfg = await fakeConfig()
  await writeFile(join(cfg.root, '.deck-abc.md'), 'x', 'utf8')
  await writeFile(join(cfg.root, 'keep.md'), 'keep', 'utf8')
  await mkdir(join(cfg.workDir, 'stale-out'), { recursive: true })
  await writeFile(join(cfg.workDir, 'leftover.txt'), 'x', 'utf8')

  await sweepStale(cfg)

  const rootAfter = await readdir(cfg.root)
  assert.ok(!rootAfter.includes('.deck-abc.md'), '.deck-*.md removed')
  assert.ok(rootAfter.includes('keep.md'), 'unrelated files preserved')
  assert.deepEqual(await readdir(cfg.workDir), [], 'workDir emptied')
})

test('render: build failure returns 500 without leaking stderr', async () => {
  const root = await mkdtemp(join(tmpdir(), 'slidekit-root-'))
  const workDir = await mkdtemp(join(tmpdir(), 'slidekit-work-'))
  const cfg = {
    ...loadConfig(),
    root,
    workDir,
    styleCss: join(root, 'style.css'),
    slidevCli: fixture('exit-1.mjs'),
    themesDir: join(root, 'themes'),
    apiKeys: [],
  }
  const app = createApp(cfg, logger)
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${app.server.address().port}`
  try {
    const r = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'content-type': 'text/markdown' },
      body: '# hi',
    })
    assert.equal(r.status, 500)
    const body = await r.text()
    assert.ok(!body.includes('SECRET_STDERR_LEAK_MARKER'), 'stderr must not leak to the client')
  } finally {
    app.server.close()
    app.limiter.stop?.()
  }
})
