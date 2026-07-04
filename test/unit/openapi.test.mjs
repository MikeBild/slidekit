import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildOpenApi } from '../../src/openapi.mjs'

test('builds a 3.1 doc with all routes', () => {
  const doc = buildOpenApi(['neutral', 'editorial'], { defaultTheme: 'neutral' })
  assert.equal(doc.openapi, '3.1.0')
  for (const p of [
    '/',
    '/themes',
    '/health',
    '/ready',
    '/metrics',
    '/render',
    '/openapi.json',
    '/llms.txt',
    '/llms-full.txt',
  ]) {
    assert.ok(doc.paths[p], `missing path ${p}`)
  }
  assert.equal(doc.paths['/docs'], undefined) // Redoc removed
})

test('theme enum is injected dynamically', () => {
  const doc = buildOpenApi(['a', 'b', 'c'], { defaultTheme: 'b' })
  const theme = doc.paths['/render'].post.parameters.find((p) => p.name === 'theme')
  assert.deepEqual(theme.schema.enum, ['a', 'b', 'c'])
  assert.equal(theme.schema.default, 'b')
})

test('security scheme appears only when auth enabled', () => {
  const open = buildOpenApi(['neutral'], { authEnabled: false })
  assert.equal(open.components, undefined)
  assert.equal(open.paths['/render'].post.security, undefined)

  const secured = buildOpenApi(['neutral'], { authEnabled: true })
  assert.ok(secured.components.securitySchemes.bearerAuth)
  assert.ok(secured.paths['/render'].post.security)
  assert.equal(secured.paths['/health'].get.security, undefined) // probes stay public
})
