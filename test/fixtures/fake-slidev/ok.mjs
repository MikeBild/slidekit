// Fake `slidev build`: parse `--out <dir>`, write a minimal index.html, exit 0.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const outDir = outIdx >= 0 ? args[outIdx + 1] : null
if (!outDir) process.exit(2)
await mkdir(outDir, { recursive: true })
await writeFile(
  join(outDir, 'index.html'),
  '<!DOCTYPE html><html><head></head><body>ok</body></html>',
  'utf8',
)
process.exit(0)
