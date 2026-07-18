import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMetrics } from '../../src/metrics.mjs'

test('requestDone aggregates counts per route + status', () => {
  const m = createMetrics()
  m.requestDone('/render', 200)
  m.requestDone('/render', 200)
  m.requestDone('/render', 401)
  m.requestDone('/health', 200)
  const out = m.render(0)
  assert.match(out, /slidekit_requests_total\{route="\/render",status="200"\} 2\n/)
  assert.match(out, /slidekit_requests_total\{route="\/render",status="401"\} 1\n/)
  assert.match(out, /slidekit_requests_total\{route="\/health",status="200"\} 1\n/)
})

test('buildObserved counts builds and sums durations', () => {
  const m = createMetrics()
  m.buildObserved(100)
  m.buildObserved(250)
  const out = m.render(1)
  assert.match(out, /slidekit_builds_total\{result="success"\} 2\n/)
  assert.match(out, /slidekit_builds_total\{result="error"\} 0\n/)
  assert.match(out, /slidekit_build_duration_seconds_sum 0.35\n/)
  assert.match(out, /slidekit_build_duration_seconds_count 2\n/)
  assert.match(out, /slidekit_build_duration_ms_sum 350\n/)
  assert.match(out, /slidekit_builds_inflight 1\n/)
})

test('cache hit/miss counters', () => {
  const m = createMetrics()
  m.cacheHit()
  m.cacheHit()
  m.cacheMiss()
  const out = m.render(0)
  assert.match(out, /slidekit_cache_hits_total 2\n/)
  assert.match(out, /slidekit_cache_misses_total 1\n/)
})

test('render output is Prometheus text format (HELP/TYPE per metric)', () => {
  const out = createMetrics().render(0)
  for (const name of [
    'slidekit_requests_total',
    'slidekit_builds_total',
    'slidekit_build_duration_seconds',
    'slidekit_build_duration_ms_sum',
    'slidekit_builds_inflight',
    'slidekit_cache_hits_total',
    'slidekit_cache_misses_total',
    'slidekit_job_transitions_total',
  ]) {
    assert.match(out, new RegExp(`# HELP ${name} `))
    assert.match(out, new RegExp(`# TYPE ${name} `))
  }
})
