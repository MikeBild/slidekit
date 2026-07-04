// Fake `slidev build` that spawns a grandchild (like Slidev's Vite/esbuild
// workers) and then hangs. build.mjs starts us detached, so we lead the process
// group; a group kill on timeout must take the grandchild down with us.
// We record the grandchild PID to SLIDEKIT_TEST_PIDFILE so the test can assert
// it was reaped.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// Grandchild inherits our process group (not detached).
const gc = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1 << 30)'], { stdio: 'ignore' })
const pidFile = process.env.SLIDEKIT_TEST_PIDFILE
if (pidFile) writeFileSync(pidFile, String(gc.pid), 'utf8')

setInterval(() => {}, 1 << 30)
