// Pure HTML/Markdown post-processing helpers (no I/O) — unit-tested.

export const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Ensure `routerMode: hash` in the deck headmatter so the built single file
// works offline (file://) and presenter mode is reachable without a server.
// Injected only if absent. Idempotent.
export function ensureHashRouting(md) {
  const text = md.replace(/^\uFEFF/, '')
  if (/^\s*---/.test(text)) {
    const rest = text.slice(text.indexOf('---') + 3)
    const endIdx = rest.indexOf('\n---')
    const headmatter = endIdx >= 0 ? rest.slice(0, endIdx) : ''
    if (/(^|\n)routerMode\s*:/.test(headmatter)) return text
    return text.replace(/^\s*---[^\n]*\n/, (open) => open + 'routerMode: hash\n')
  }
  return `---\nrouterMode: hash\n---\n\n` + text
}

// Force the Slidev base `theme:` in the deck headmatter to a known-installed
// theme. slidekit's `?theme=` selects a CSS overlay, NOT a Slidev theme package;
// an uploaded `theme:` (e.g. `neutral`, or any uninstalled theme) would make the
// offline build fail with "theme not found". Normalizing it makes /render robust
// against arbitrary input. Idempotent; only touches the top-level `theme:` key.
export function forceBaseTheme(md, theme) {
  const text = md.replace(/^\uFEFF/, '')
  const fm = text.match(/^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/)
  if (!fm) {
    return `---\ntheme: ${theme}\n---\n\n` + text
  }
  const body = fm[2]
    .replace(/(^|\n)theme[ \t]*:[^\n]*/g, '') // strip top-level theme: lines
    .replace(/^\n+/, '')
  return fm[1] + `theme: ${theme}\n` + body + fm[3] + text.slice(fm[0].length)
}

// Drop external resource references so the file is fully self-contained.
export function stripExternals(html) {
  return html
    .replace(/<link\b[^>]*\brel=["']?(?:shortcut )?icon["']?[^>]*>/gi, '')
    .replace(/<link\b[^>]*\brel=["']?apple-touch-icon["']?[^>]*>/gi, '')
    .replace(/<link\b[^>]*fonts\.g(?:oogleapis|static)\.com[^>]*>/gi, '')
}

// Remove an existing <meta name|property="key"> so our value wins (no dupes).
export function stripMetaKey(html, key) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html.replace(
    new RegExp(`<meta\\b[^>]*\\b(?:name|property)=["']${k}["'][^>]*>\\s*`, 'gi'),
    '',
  )
}

// Build a self-contained favicon as a data: URI so the deck stays offline.
// A `data:` value is passed through; anything else is treated as emoji/short
// text and rendered into a tiny SVG. Returns '' for empty input.
export function faviconDataUri(input) {
  if (!input) return ''
  if (/^data:/i.test(input)) return input
  const text = esc(String(input)).slice(0, 16)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text y="54" font-size="54">${text}</text></svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

// Inject HTML + social/OpenGraph/Twitter/SEO meta from upload fields, replacing
// any existing instances so there are no duplicates.
export function injectMeta(html, meta) {
  let out = html
  const add = []
  const set = (key, val, attr = 'name') => {
    if (val == null || val === '') return
    out = stripMetaKey(out, key)
    add.push(`<meta ${attr}="${key}" content="${esc(val)}">`)
  }
  set('author', meta.author)
  set('keywords', meta.tags)
  set('description', meta.description)
  set('robots', meta.robots)
  set('theme-color', meta.themeColor)
  set('og:title', meta.title, 'property')
  set('og:description', meta.description, 'property')
  set('og:type', 'website', 'property')
  set('og:url', meta.url, 'property')
  set('og:site_name', meta.siteName, 'property')
  set('og:locale', meta.locale, 'property')
  set('og:image', meta.image, 'property')
  set('og:image:alt', meta.image ? meta.imageAlt : '', 'property')
  set('twitter:card', meta.image ? 'summary_large_image' : 'summary')
  set('twitter:title', meta.title)
  set('twitter:description', meta.description)
  set('twitter:image', meta.image)
  set('twitter:image:alt', meta.image ? meta.imageAlt : '')
  set('twitter:site', meta.twitterSite)
  set('twitter:creator', meta.twitterCreator)

  if (meta.url) add.push(`<link rel="canonical" href="${esc(meta.url)}">`)
  const favicon = faviconDataUri(meta.favicon)
  if (favicon) add.push(`<link rel="icon" href="${esc(favicon)}">`)

  if (meta.title) {
    out = /<title>[\s\S]*?<\/title>/i.test(out)
      ? out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(meta.title)}</title>`)
      : out.replace(/<head>/i, `<head><title>${esc(meta.title)}</title>`)
  }
  if (meta.lang) {
    const lang = esc(meta.lang)
    out = /<html\b[^>]*\blang=/i.test(out)
      ? out.replace(/(<html\b[^>]*\blang=)(["']).*?\2/i, `$1$2${lang}$2`)
      : out.replace(/<html\b/i, `<html lang="${lang}"`)
  }
  return out.replace(/<\/head>/i, '\n' + add.join('\n') + '\n</head>')
}

export function metaFromQuery(url, defaultTheme) {
  const q = url.searchParams
  return {
    theme: q.get('theme') || defaultTheme,
    title: q.get('title') || '',
    author: q.get('author') || '',
    tags: q.get('tags') || '',
    description: q.get('description') || '',
    image: q.get('image') || '',
    imageAlt: q.get('imageAlt') || '',
    url: q.get('url') || '',
    siteName: q.get('siteName') || '',
    locale: q.get('locale') || '',
    lang: q.get('lang') || '',
    robots: q.get('robots') || '',
    themeColor: q.get('themeColor') || '',
    twitterSite: q.get('twitterSite') || '',
    twitterCreator: q.get('twitterCreator') || '',
    favicon: q.get('favicon') || '',
    download: q.get('download') === '1',
  }
}

export function sanitizeFilename(title) {
  return (title || 'deck').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'deck'
}
