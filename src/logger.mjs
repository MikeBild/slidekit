// Minimal zero-dependency structured logger. One line per record to stdout
// (12-factor logs). `json` for machines, `pretty` for local dev. child() adds
// bound fields (e.g. per-request id). Never log secrets — pass key fingerprints.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

export function createLogger({ level = 'info', format = 'json' } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info

  function emit(lvl, msg, fields) {
    if ((LEVELS[lvl] ?? LEVELS.info) < threshold) return
    const ts = new Date().toISOString()
    if (format === 'pretty') {
      const extra = fields && Object.keys(fields).length ? ' ' + JSON.stringify(fields) : ''
      process.stdout.write(`${ts} ${lvl.toUpperCase().padEnd(5)} ${msg}${extra}\n`)
    } else {
      process.stdout.write(JSON.stringify({ ts, level: lvl, msg, ...fields }) + '\n')
    }
  }

  const make = (bound = {}) => ({
    debug: (m, f) => emit('debug', m, { ...bound, ...f }),
    info: (m, f) => emit('info', m, { ...bound, ...f }),
    warn: (m, f) => emit('warn', m, { ...bound, ...f }),
    error: (m, f) => emit('error', m, { ...bound, ...f }),
    child: (b) => make({ ...bound, ...b }),
  })

  return make()
}
