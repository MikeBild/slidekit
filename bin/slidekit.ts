// slidekit-deck — self-contained single executable.
//
// Embeds the full Slidev runtime (Node + node_modules + themes + fonts + config)
// as a compressed payload. On first run it extracts the runtime into a cache dir
// (keyed by the payload's content hash, so a rebuilt payload auto-invalidates),
// then launches the HTTP deck server. One file to ship; no Docker.
//
// The payload lives in Bun's virtual FS (/$bunfs/...), which external processes
// can't read directly — so we stream it into `tar` via stdin using Bun.file().
import payloadPath from '../payload.tgz' with { type: 'file' }
import CACHE_KEY from './cache-key'
import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

const BASE = join(homedir(), '.cache', 'slidekit-deck')
const CACHE = join(BASE, CACHE_KEY)
const nodeBin = join(CACHE, '.node-bin')
const server = join(CACHE, 'server.mjs')
const ready = join(CACHE, '.ready')

// Extract unless a previous run completed (.ready) AND the payload's files are
// actually present (guards against partial extraction).
const complete =
  existsSync(ready) &&
  existsSync(server) &&
  existsSync(join(CACHE, 'fonts.css')) &&
  existsSync(join(CACHE, 'themes', 'neutral.css'))

if (!complete) {
  process.stderr.write(`slidekit: first run — unpacking runtime to ${CACHE} …\n`)
  rmSync(CACHE, { recursive: true, force: true })
  mkdirSync(CACHE, { recursive: true })
  const tar = Bun.spawn(['tar', '-xzf', '-', '-C', CACHE], {
    stdin: Bun.file(payloadPath),
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const code = await tar.exited
  if (code !== 0) {
    process.stderr.write('slidekit: failed to unpack runtime\n')
    process.exit(1)
  }
  writeFileSync(ready, new Date().toISOString())
  // Prune stale cache versions from older builds.
  for (const d of readdirSync(BASE)) {
    if (d !== CACHE_KEY) rmSync(join(BASE, d), { recursive: true, force: true })
  }
}

const child = Bun.spawn([nodeBin, server], {
  stdio: ['inherit', 'inherit', 'inherit'],
  env: process.env,
})
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
const exitCode = await child.exited
process.exit(exitCode ?? 0)
