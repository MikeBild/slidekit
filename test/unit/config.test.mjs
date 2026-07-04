import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../../src/config.mjs'

const CLEAR = [
  'PORT',
  'HOST',
  'SLIDEKIT_API_KEYS',
  'SLIDEKIT_REQUIRE_AUTH_ALL',
  'SLIDEKIT_RATE_LIMIT_MAX',
]
function clear() {
  for (const k of CLEAR) delete process.env[k]
}

test('returns frozen defaults', () => {
  clear()
  const c = loadConfig()
  assert.equal(c.port, 4030)
  assert.equal(c.host, '0.0.0.0')
  assert.equal(c.defaultTheme, 'neutral')
  assert.equal(c.rateLimitMax, 30)
  assert.deepEqual(c.apiKeys, [])
  assert.equal(c.requireAuthAll, false)
  assert.ok(Object.isFrozen(c))
})

test('coerces numbers, lists and booleans from env', () => {
  clear()
  process.env.PORT = '8080'
  process.env.SLIDEKIT_API_KEYS = 'a, b ,c'
  process.env.SLIDEKIT_REQUIRE_AUTH_ALL = '1'
  const c = loadConfig()
  assert.equal(c.port, 8080)
  assert.deepEqual(c.apiKeys, ['a', 'b', 'c'])
  assert.equal(c.requireAuthAll, true)
  clear()
})

test('throws on an invalid number (fail fast)', () => {
  clear()
  process.env.PORT = 'not-a-number'
  assert.throws(() => loadConfig(), /Invalid number for PORT/)
  clear()
})
