import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter } from '../../src/ratelimit.mjs'

test('allows up to max then denies, with a controllable clock', () => {
  let t = 1000
  const rl = createRateLimiter({ windowMs: 1000, max: 2, now: () => t })
  assert.equal(rl.take('a').allowed, true)
  assert.equal(rl.take('a').allowed, true)
  const third = rl.take('a')
  assert.equal(third.allowed, false)
  assert.equal(third.remaining, 0)
  assert.ok(third.retryAfter > 0)
  rl.stop()
})

test('resets after the window elapses', () => {
  let t = 0
  const rl = createRateLimiter({ windowMs: 1000, max: 1, now: () => t })
  assert.equal(rl.take('a').allowed, true)
  assert.equal(rl.take('a').allowed, false)
  t = 1001
  assert.equal(rl.take('a').allowed, true)
  rl.stop()
})

test('separate identities have separate buckets', () => {
  let t = 0
  const rl = createRateLimiter({ windowMs: 1000, max: 1, now: () => t })
  assert.equal(rl.take('a').allowed, true)
  assert.equal(rl.take('b').allowed, true)
  rl.stop()
})

test('max <= 0 disables limiting', () => {
  const rl = createRateLimiter({ windowMs: 1000, max: 0 })
  assert.equal(rl.enabled, false)
  for (let i = 0; i < 100; i++) assert.equal(rl.take('a').allowed, true)
  rl.stop()
})
