// Fake `slidev build` that takes a while (SLIDEKIT_TEST_DELAY_MS, default 300ms)
// then succeeds — used to keep the single build slot busy while the queue fills.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const outDir = outIdx >= 0 ? args[outIdx + 1] : null
if (!outDir) process.exit(2)
await delay(Number(process.env.SLIDEKIT_TEST_DELAY_MS) || 300)
await mkdir(outDir, { recursive: true })
await writeFile(
  join(outDir, 'index.html'),
  '<!DOCTYPE html><html><head></head><body>slow</body></html>',
  'utf8',
)
process.exit(0)
