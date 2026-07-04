// Drift guards: keep the OpenAPI spec, the LLM docs, and the config docs in sync
// with the implementation. These fail in CI if any of them diverge.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ROUTES, buildOpenApi } from '../../src/openapi.mjs'
import { loadConfig } from '../../src/config.mjs'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const routePaths = () => new Set(ROUTES.map((r) => r.path))

function eqSets(a, b, label) {
  const onlyA = [...a].filter((x) => !b.has(x))
  const onlyB = [...b].filter((x) => !a.has(x))
  assert.deepEqual(
    [...a].sort(),
    [...b].sort(),
    `${label}\n  only in first:  ${onlyA.join(', ') || '—'}\n  only in second: ${onlyB.join(', ') || '—'}`,
  )
}

// (a) OpenAPI generation: every route the server handles must be in the ROUTES
// registry that generates the spec, and vice versa.
test('drift: server route handlers ↔ OpenAPI ROUTES', () => {
  const src = read('../../src/server.mjs')
  const handled = new Set([...src.matchAll(/path\s*===\s*['"]([^'"]+)['"]/g)].map((m) => m[1]))
  // Parameterized job routes are matched by prefix, not an exact literal.
  if (/path\.startsWith\(['"]\/jobs\/['"]\)/.test(src)) {
    handled.add('/jobs/{id}')
    handled.add('/jobs/{id}/result')
  }
  eqSets(handled, routePaths(), 'server handlers vs OpenAPI ROUTES')
})

// (b) Docs ↔ spec: the endpoint table in llms-full.txt must list exactly ROUTES.
test('drift: llms-full.txt endpoint table ↔ ROUTES', () => {
  const full = read('../../docs/llms-full.txt')
  const start = full.indexOf('### Endpoints')
  const end = full.indexOf('###', start + 3)
  assert.ok(start >= 0 && end > start, 'Endpoints section not found in llms-full.txt')
  const tablePaths = new Set([...full.slice(start, end).matchAll(/`(\/[^`]*)`/g)].map((m) => m[1]))
  assert.ok(tablePaths.size >= 5, 'endpoint table too small / not parsed')
  eqSets(tablePaths, routePaths(), 'llms-full Endpoints table vs ROUTES')
})

// (b2) llms.txt (the index) is NOT auto-generated — guard its prose endpoint
// list so it can't silently drift when routes are added. Every ROUTES path must
// be mentioned (backtick-wrapped) in the "Endpoints:" line.
test('drift: llms.txt endpoint list ↔ ROUTES', () => {
  const idx = read('../../docs/llms.txt')
  const line = idx.split('\n').find((l) => /(^|\W)Endpoints?:/i.test(l)) || ''
  // Entries look like `GET /path` or `POST /render` — pull the /path out of each.
  const mentioned = new Set()
  for (const m of line.matchAll(/`([^`]+)`/g)) {
    const pm = m[1].match(/\/\S*/)
    if (pm) mentioned.add(pm[0].replace(/[.,;]$/, ''))
  }
  for (const p of routePaths()) {
    assert.ok(mentioned.has(p), `route ${p} not listed in docs/llms.txt Endpoints line`)
  }
})

// (c) Config ↔ docs: every env var read by config.mjs must be documented in both
// CONFIGURATION.md and llms-full.txt (backtick-wrapped).
test('drift: config env vars ↔ docs', () => {
  const cfg = read('../../src/config.mjs')
  const envs = [
    ...new Set(
      [...cfg.matchAll(/\b(?:num|bool|str|list)\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g)].map((m) => m[1]),
    ),
  ]
  assert.ok(envs.length >= 15, `expected the full env set, parsed ${envs.length}`)
  const conf = read('../../docs/CONFIGURATION.md')
  const full = read('../../docs/llms-full.txt')
  for (const e of envs) {
    assert.ok(conf.includes('`' + e + '`'), `${e} not documented in docs/CONFIGURATION.md`)
    assert.ok(full.includes('`' + e + '`'), `${e} not documented in docs/llms-full.txt`)
  }
})

// (d) Version: the OpenAPI info.version comes from package.json (not hardcoded).
test('drift: OpenAPI version is sourced from package.json', () => {
  const pkg = JSON.parse(read('../../package.json'))
  assert.equal(loadConfig().version, pkg.version)
  assert.equal(buildOpenApi([], { version: pkg.version }).info.version, pkg.version)
})
