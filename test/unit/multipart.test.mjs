import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMultipart } from '../../src/multipart.mjs'

const B = '----slidekitTestBoundary'
const ct = `multipart/form-data; boundary=${B}`

test('extracts a file part', () => {
  const body = Buffer.from(
    `--${B}\r\nContent-Disposition: form-data; name="file"; filename="d.md"\r\n` +
      `Content-Type: text/markdown\r\n\r\n# Hello\n\n---\n\n# Two\r\n--${B}--\r\n`,
  )
  const md = parseMultipart(body, ct)
  assert.match(md, /# Hello/)
  assert.match(md, /# Two/)
  assert.ok(!md.endsWith('\r\n'))
})

test('extracts a named markdown field', () => {
  const body = Buffer.from(
    `--${B}\r\nContent-Disposition: form-data; name="markdown"\r\n\r\n# X\r\n--${B}--\r\n`,
  )
  assert.equal(parseMultipart(body, ct), '# X')
})

test('returns null when no usable part and on missing boundary', () => {
  const body = Buffer.from(
    `--${B}\r\nContent-Disposition: form-data; name="other"\r\n\r\nz\r\n--${B}--\r\n`,
  )
  assert.equal(parseMultipart(body, ct), null)
  assert.equal(parseMultipart(Buffer.from('x'), 'multipart/form-data'), null)
})
