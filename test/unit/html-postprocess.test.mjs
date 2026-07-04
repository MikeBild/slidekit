import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  esc,
  ensureHashRouting,
  forceBaseTheme,
  stripExternals,
  stripMetaKey,
  injectMeta,
  metaFromQuery,
  sanitizeFilename,
  faviconDataUri,
} from '../../src/html-postprocess.mjs'

test('esc escapes HTML special chars', () => {
  assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;')
})

test('ensureHashRouting: no frontmatter prepends headmatter', () => {
  const out = ensureHashRouting('# Hi')
  assert.match(out, /^---\nrouterMode: hash\n---\n/)
  assert.match(out, /# Hi/)
})

test('ensureHashRouting: injects into existing frontmatter', () => {
  const out = ensureHashRouting('---\ntheme: seriph\n---\n\n# Hi')
  assert.match(out, /routerMode: hash/)
  assert.match(out, /theme: seriph/)
})

test('ensureHashRouting: leaves existing routerMode untouched (idempotent)', () => {
  const src = '---\nrouterMode: history\n---\n\n# Hi'
  assert.equal(ensureHashRouting(src), src)
  const once = ensureHashRouting('# Hi')
  assert.equal(ensureHashRouting(once), once)
})

test('ensureHashRouting: strips a leading BOM', () => {
  const out = ensureHashRouting('﻿# Hi')
  assert.ok(!out.startsWith('﻿'))
  assert.match(out, /routerMode: hash/)
})

test('forceBaseTheme replaces an unknown/overlay theme with the base theme', () => {
  // the bug: a deck with `theme: neutral` (an overlay name) broke the build.
  const out = forceBaseTheme('---\ntheme: neutral\ntitle: X\n---\n\n# Hi', 'seriph')
  assert.match(out, /(^|\n)theme: seriph(\n|$)/)
  assert.doesNotMatch(out, /theme: neutral/)
  assert.match(out, /title: X/)
  assert.match(out, /# Hi/)
  // exactly one top-level theme key
  assert.equal(
    (out.match(/\ntheme:/g) || out.match(/^theme:/) || []).length || (/^theme:/.test(out) ? 1 : 0),
    1,
  )
})

test('forceBaseTheme injects a theme when there is no frontmatter', () => {
  const out = forceBaseTheme('# Hi\n\n---\n\n# Two', 'seriph')
  assert.match(out, /^---\ntheme: seriph\n---\n/)
  assert.match(out, /# Hi/)
})

test('forceBaseTheme leaves a non-top-level (indented) theme key alone', () => {
  const out = forceBaseTheme('---\nseoMeta:\n  theme: dark\n---\n\n# Hi', 'seriph')
  assert.match(out, / {2}theme: dark/) // nested key preserved
  assert.match(out, /(^|\n)theme: seriph/) // top-level base theme added
})

test('forceBaseTheme is stable when applied twice', () => {
  const once = forceBaseTheme('---\ntheme: x\n---\n\n# Hi', 'seriph')
  const twice = forceBaseTheme(once, 'seriph')
  assert.equal((twice.match(/(^|\n)theme:/g) || []).length, 1)
})

test('stripExternals removes favicon + google fonts links', () => {
  const html = `<head><link rel="icon" href="x.png"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?x"><link rel="preconnect" href="https://fonts.gstatic.com"></head>`
  const out = stripExternals(html)
  assert.ok(!/googleapis|gstatic|rel="icon"/.test(out))
})

test('stripMetaKey removes a specific meta', () => {
  const html =
    '<head><meta name="description" content="a"><meta property="og:title" content="b"></head>'
  assert.ok(!/name="description"/.test(stripMetaKey(html, 'description')))
  assert.ok(/og:title/.test(stripMetaKey(html, 'description')))
})

test('injectMeta dedupes and sets title + og/twitter', () => {
  const html = '<head><title>Old</title><meta name="description" content="old"></head><body></body>'
  const out = injectMeta(html, {
    title: 'New',
    description: 'D',
    image: 'http://x/y.png',
    author: 'Me',
    tags: 'a,b',
  })
  assert.equal((out.match(/<title>/g) || []).length, 1)
  assert.match(out, /<title>New<\/title>/)
  assert.equal((out.match(/name="description"/g) || []).length, 1)
  assert.match(out, /property="og:title" content="New"/)
  assert.match(out, /name="twitter:card" content="summary_large_image"/)
  assert.match(out, /property="og:image" content="http:\/\/x\/y.png"/)
})

test('injectMeta uses summary card without image', () => {
  const out = injectMeta('<head></head>', { description: 'D' })
  assert.match(out, /name="twitter:card" content="summary"/)
})

test('injectMeta adds extended OG/SEO meta + canonical', () => {
  const out = injectMeta('<head></head>', {
    url: 'https://ex.com/d',
    siteName: 'Site',
    locale: 'en_US',
    robots: 'noindex',
    themeColor: '#0ff',
    twitterSite: '@s',
    twitterCreator: '@c',
  })
  assert.match(out, /property="og:url" content="https:\/\/ex.com\/d"/)
  assert.match(out, /<link rel="canonical" href="https:\/\/ex.com\/d">/)
  assert.match(out, /property="og:site_name" content="Site"/)
  assert.match(out, /property="og:locale" content="en_US"/)
  assert.match(out, /name="robots" content="noindex"/)
  assert.match(out, /name="theme-color" content="#0ff"/)
  assert.match(out, /name="twitter:site" content="@s"/)
  assert.match(out, /name="twitter:creator" content="@c"/)
})

test('injectMeta image:alt only when an image is present', () => {
  assert.match(
    injectMeta('<head></head>', { image: 'http://x/y.png', imageAlt: 'Alt' }),
    /property="og:image:alt" content="Alt"/,
  )
  assert.doesNotMatch(injectMeta('<head></head>', { imageAlt: 'Alt' }), /image:alt/)
})

test('injectMeta sets <html lang>', () => {
  assert.match(injectMeta('<html><head></head>', { lang: 'de' }), /<html lang="de">/)
  assert.match(injectMeta('<html lang="en"><head></head>', { lang: 'de' }), /<html lang="de">/)
})

test('faviconDataUri: emoji -> inline SVG data URI, data: passthrough, empty -> ""', () => {
  assert.equal(faviconDataUri(''), '')
  const emoji = faviconDataUri('🎯')
  assert.match(emoji, /^data:image\/svg\+xml,/)
  assert.match(decodeURIComponent(emoji), /<svg[\s\S]*🎯[\s\S]*<\/svg>/)
  assert.equal(faviconDataUri('data:image/x,abc'), 'data:image/x,abc')
})

test('injectMeta inlines a favicon link (offline-safe)', () => {
  const out = injectMeta('<head></head>', { favicon: '🎯' })
  assert.match(out, /<link rel="icon" href="data:image\/svg\+xml,/)
})

test('metaFromQuery parses params with default theme', () => {
  const url = new URL('http://x/render?title=T&download=1')
  const m = metaFromQuery(url, 'neutral')
  assert.equal(m.theme, 'neutral')
  assert.equal(m.title, 'T')
  assert.equal(m.download, true)
})

test('sanitizeFilename strips unsafe chars', () => {
  assert.equal(sanitizeFilename('My Deck: v2!'), 'My_Deck_v2')
  assert.equal(sanitizeFilename(''), 'deck')
})
