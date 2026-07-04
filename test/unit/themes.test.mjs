import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTheme } from '../../src/themes.mjs'

test('resolveTheme returns the request when available', () => {
  assert.equal(resolveTheme('editorial', ['neutral', 'editorial'], 'neutral'), 'editorial')
})

test('resolveTheme falls back when unknown', () => {
  assert.equal(resolveTheme('nope', ['neutral', 'editorial'], 'neutral'), 'neutral')
  assert.equal(resolveTheme('', ['neutral'], 'neutral'), 'neutral')
})
