import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLogger } from '../../src/logger.mjs'

// Capture stdout lines written during fn().
function capture(fn) {
  const lines = []
  const original = process.stdout.write
  process.stdout.write = (chunk) => {
    lines.push(String(chunk))
    return true
  }
  try {
    fn()
  } finally {
    process.stdout.write = original
  }
  return lines
}

test('json format emits one JSON line with ts, level, msg and fields', () => {
  const log = createLogger({ level: 'info', format: 'json' })
  const lines = capture(() => log.info('hello', { a: 1 }))
  assert.equal(lines.length, 1)
  const rec = JSON.parse(lines[0])
  assert.equal(rec.level, 'info')
  assert.equal(rec.msg, 'hello')
  assert.equal(rec.a, 1)
  assert.ok(!Number.isNaN(Date.parse(rec.ts)))
})

test('records below the level threshold are dropped', () => {
  const log = createLogger({ level: 'warn', format: 'json' })
  const lines = capture(() => {
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')
  })
  assert.deepEqual(
    lines.map((l) => JSON.parse(l).level),
    ['warn', 'error'],
  )
})

test('unknown level falls back to info', () => {
  const log = createLogger({ level: 'nope', format: 'json' })
  const lines = capture(() => {
    log.debug('d')
    log.info('i')
  })
  assert.deepEqual(
    lines.map((l) => JSON.parse(l).level),
    ['info'],
  )
})

test('pretty format is human-readable and appends fields as JSON', () => {
  const log = createLogger({ level: 'info', format: 'pretty' })
  const lines = capture(() => {
    log.warn('watch out', { code: 42 })
    log.info('plain')
  })
  assert.match(lines[0], /WARN {2}watch out \{"code":42\}\n$/)
  assert.match(lines[1], /INFO {2}plain\n$/)
})

test('child() binds fields and merges across nesting; call fields win', () => {
  const log = createLogger({ level: 'info', format: 'json' })
  const child = log.child({ req: 'r1', shared: 'parent' })
  const grandchild = child.child({ job: 'j1' })
  const lines = capture(() => grandchild.info('m', { shared: 'call' }))
  const rec = JSON.parse(lines[0])
  assert.equal(rec.req, 'r1')
  assert.equal(rec.job, 'j1')
  assert.equal(rec.shared, 'call')
})
