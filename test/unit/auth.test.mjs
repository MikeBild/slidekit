import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractApiKey, createAuthChecker, fingerprint } from '../../src/auth.mjs'

test('extractApiKey reads Bearer then X-API-Key', () => {
  assert.equal(extractApiKey({ authorization: 'Bearer abc' }), 'abc')
  assert.equal(extractApiKey({ 'x-api-key': 'xyz' }), 'xyz')
  assert.equal(extractApiKey({}), '')
})

test('auth disabled when no keys configured', () => {
  const a = createAuthChecker([])
  assert.equal(a.enabled, false)
  assert.equal(a.check('anything'), true)
  assert.equal(a.check(''), true)
})

test('auth validates configured keys (constant-time, any length)', () => {
  const a = createAuthChecker(['secret123', 'other'])
  assert.equal(a.enabled, true)
  assert.equal(a.check('secret123'), true)
  assert.equal(a.check('other'), true)
  assert.equal(a.check('wrong'), false)
  assert.equal(a.check(''), false)
  assert.equal(a.check('a-much-longer-wrong-key-than-configured'), false) // no throw on length mismatch
})

test('fingerprint is short and non-reversible-looking', () => {
  assert.equal(fingerprint(''), null)
  const fp = fingerprint('secret123')
  assert.equal(fp.length, 8)
  assert.notEqual(fp, 'secret123')
})
