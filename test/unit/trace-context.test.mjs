import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTraceContext, parseTraceparent } from '../../src/trace-context.mjs'

test('parses and continues a valid W3C traceparent', () => {
  const incoming = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
  assert.deepEqual(parseTraceparent(incoming), {
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    parentSpanId: '00f067aa0ba902b7',
    flags: '01',
  })
  const context = createTraceContext(incoming, (bytes) =>
    bytes === 8 ? '1'.repeat(16) : '2'.repeat(32),
  )
  assert.equal(context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
  assert.equal(context.parentSpanId, '00f067aa0ba902b7')
  assert.equal(context.traceparent, '00-4bf92f3577b34da6a3ce929d0e0e4736-1111111111111111-01')
})

test('rejects malformed and all-zero identifiers', () => {
  assert.equal(parseTraceparent('garbage'), null)
  assert.equal(parseTraceparent('00-' + '0'.repeat(32) + '-' + '1'.repeat(16) + '-01'), null)
  assert.equal(parseTraceparent('00-' + '1'.repeat(32) + '-' + '0'.repeat(16) + '-01'), null)
})
