// The dangerous core: runs a REAL `slidev build` on uploaded Markdown.
// Slidev/Vite executes code in the deck during the build, so this must only be
// reached for trusted/authenticated input (see SECURITY.md). Hardened with a
// concurrency semaphore, a bounded queue, a timeout, and guaranteed cleanup.
import { spawn } from 'node:child_process'
import { writeFile, readFile, rm, mkdir, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { setActiveTheme } from './themes.mjs'

export class BuildError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code // 'QUEUE_FULL' | 'QUEUE_TIMEOUT' | 'TIMEOUT' | 'BUILD_FAILED'
  }
}

const IS_POSIX = process.platform !== 'win32'

// Kill a child and, on POSIX where it leads its own process group, the whole
// group — otherwise Slidev's Vite/esbuild grandchildren survive the kill and
// leak CPU/memory. Best-effort: the group may already be gone (ESRCH).
function killTree(child, signal) {
  try {
    if (IS_POSIX && child.pid) process.kill(-child.pid, signal)
    else child.kill(signal)
  } catch {
    /* already exited */
  }
}

// Remove leftovers from crashed builds: `.deck-*.md` in the project root and
// everything in the dedicated scratch workDir. Best-effort; never throws.
export async function sweepStale(config) {
  const rootFiles = await readdir(config.root).catch(() => [])
  await Promise.all(
    rootFiles
      .filter((f) => /^\.deck-.*\.md$/.test(f))
      .map((f) => rm(join(config.root, f), { force: true }).catch(() => {})),
  )
  const workFiles = await readdir(config.workDir).catch(() => [])
  await Promise.all(
    workFiles.map((f) =>
      rm(join(config.workDir, f), { recursive: true, force: true }).catch(() => {}),
    ),
  )
}

export function createBuildRunner(config, logger) {
  // Themes are activated by swapping the shared style.css, so concurrent builds
  // would corrupt each other. Clamp to 1 until that is refactored.
  let concurrency = config.buildConcurrency
  if (concurrency > 1) {
    logger.warn(
      'SLIDEKIT_BUILD_CONCURRENCY > 1 is not supported (themes share style.css); clamping to 1',
    )
    concurrency = 1
  }
  if (concurrency < 1) concurrency = 1

  let active = 0
  let queued = 0
  const waiters = [] // { resolve, reject, timer, timedOut }

  function acquire() {
    if (active < concurrency) {
      active++
      return Promise.resolve()
    }
    if (queued >= config.buildQueueMax)
      return Promise.reject(new BuildError('build queue full', 'QUEUE_FULL'))
    queued++
    return new Promise((resolve, reject) => {
      const w = { resolve, reject, timedOut: false }
      // Bound the queue wait: a request must not sit behind a slow build forever.
      w.timer = setTimeout(() => {
        w.timedOut = true
        const i = waiters.indexOf(w)
        if (i >= 0) waiters.splice(i, 1)
        queued--
        reject(new BuildError('queue wait timed out', 'QUEUE_TIMEOUT'))
      }, config.queueTimeoutMs)
      if (w.timer.unref) w.timer.unref()
      waiters.push(w)
    })
  }
  function release() {
    active--
    // Skip waiters that already timed out and dropped themselves.
    let next
    while ((next = waiters.shift())) {
      if (next.timedOut) continue
      clearTimeout(next.timer)
      queued--
      active++
      next.resolve()
      return
    }
  }

  function runSlidev(mdPath, outDir) {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [config.slidevCli, 'build', mdPath, '--out', outDir, '--base', '/'],
        // detached => child leads its own process group, so a timeout can kill
        // the whole tree (Slidev's Vite/esbuild workers), not just the parent.
        { cwd: config.root, stdio: ['ignore', 'ignore', 'pipe'], detached: IS_POSIX },
      )
      let err = ''
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        killTree(child, 'SIGTERM')
        setTimeout(() => killTree(child, 'SIGKILL'), 2000).unref?.()
      }, config.buildTimeoutMs)

      child.stderr.on('data', (d) => {
        err += d
      })
      child.on('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (timedOut) reject(new BuildError('build timed out', 'TIMEOUT'))
        else if (code === 0) resolve()
        else
          reject(new BuildError(`slidev build exited ${code}\n${err.slice(-4000)}`, 'BUILD_FAILED'))
      })
    })
  }

  // The entry markdown must live in config.root so Slidev resolves this
  // project's vite.config.ts + style.css (and its theme @import). Only build
  // OUTPUT goes to the scratch workDir.
  async function build(markdown, theme) {
    const id = randomUUID()
    const mdPath = join(config.root, `.deck-${id}.md`)
    const outDir = join(config.workDir, `${id}-out`)
    await mkdir(config.workDir, { recursive: true })
    await writeFile(mdPath, markdown, 'utf8')
    try {
      await setActiveTheme(config.styleCss, theme)
      await runSlidev(mdPath, outDir)
      return await readFile(join(outDir, 'index.html'), 'utf8')
    } finally {
      await setActiveTheme(config.styleCss, config.defaultTheme).catch(() => {})
      rm(mdPath, { force: true }).catch(() => {})
      rm(outDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  return {
    inflight: () => active,
    async run(markdown, theme) {
      await acquire()
      const t0 = Date.now()
      try {
        const html = await build(markdown, theme)
        logger.debug('build ok', { theme, ms: Date.now() - t0, bytes: html.length })
        return html
      } finally {
        release()
      }
    },
  }
}
