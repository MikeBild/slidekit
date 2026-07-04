// Bounded LRU cache with optional TTL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCache } from '../../src/cache.mjs'

test('cache: stores and returns values', () => {
  const c = createCache({ max: 10 })
  assert.equal(c.get('a'), undefined)
  c.put('a', 'A')
  assert.equal(c.get('a'), 'A')
})

test('cache: max=0 disables', () => {
  const c = createCache({ max: 0 })
  assert.equal(c.enabled, false)
  c.put('a', 'A')
  assert.equal(c.get('a'), undefined)
  assert.equal(c.size, 0)
})

test('cache: evicts the least-recently-used entry over capacity', () => {
  const c = createCache({ max: 2 })
  c.put('a', 'A')
  c.put('b', 'B')
  c.get('a') // bump a -> b becomes LRU
  c.put('c', 'C') // evicts b
  assert.equal(c.get('a'), 'A')
  assert.equal(c.get('b'), undefined)
  assert.equal(c.get('c'), 'C')
})

test('cache: TTL expiry via injected clock', () => {
  let t = 1000
  const c = createCache({ max: 10, ttlMs: 500, now: () => t })
  c.put('a', 'A')
  assert.equal(c.get('a'), 'A')
  t = 1600 // past 1000 + 500
  assert.equal(c.get('a'), undefined)
  c.stop()
})
