// Theme discovery + activation. Themes are CSS overlay files in themesDir;
// style.css is a pointer the build swaps per request.
import { readdir, writeFile } from 'node:fs/promises'

export async function listThemes(themesDir) {
  const files = await readdir(themesDir).catch(() => [])
  return files
    .filter((f) => f.endsWith('.css'))
    .map((f) => f.slice(0, -4))
    .sort()
}

// Pure: pick the requested theme if available, else the fallback.
export function resolveTheme(requested, available, fallback) {
  return available.includes(requested) ? requested : fallback
}

export async function setActiveTheme(styleCssPath, name) {
  await writeFile(styleCssPath, `@import './themes/${name}.css';\n`, 'utf8')
}
