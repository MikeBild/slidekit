import { mkdirSync, readFileSync } from 'node:fs'
import { chmod, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const HOUR_MS = 60 * 60 * 1000
const RETENTION_HOURS = 93 * 24
const MAX_QUERY_HOURS = 90 * 24

function emptyBucket(startMs) {
  return {
    start: new Date(startMs).toISOString(),
    renders: { sync: 0, async: 0 },
    builds: {
      success: 0,
      error: 0,
      duration_seconds_sum: 0,
      duration_count: 0,
      output_bytes_sum: 0,
    },
    cache: { hit: 0, miss: 0 },
    jobs: { queued: 0, running: 0, done: 0, error: 0 },
  }
}

function hourStart(value = Date.now()) {
  return Math.floor(value / HOUR_MS) * HOUR_MS
}

function parseHour(value, name) {
  const ms = Date.parse(value || '')
  if (!Number.isFinite(ms) || ms !== hourStart(ms)) {
    throw new Error(`${name} must be a full UTC hour`)
  }
  return ms
}

export function resolveStatsWindow(searchParams, now = Date.now()) {
  const defaultTo = hourStart(now)
  const to = searchParams.get('to') ? parseHour(searchParams.get('to'), 'to') : defaultTo
  const from = searchParams.get('from')
    ? parseHour(searchParams.get('from'), 'from')
    : to - 24 * HOUR_MS
  if (to <= from) throw new Error('to must be after from')
  if ((to - from) / HOUR_MS > MAX_QUERY_HOURS) throw new Error('window may span at most 90 days')
  return { from, to }
}

export function createBuildStats({ statePath, serviceVersion, now = () => Date.now() }) {
  let loadReason = null
  let state
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'))
    if (parsed.schema_version !== 1 || typeof parsed.started_at !== 'string' || !parsed.buckets) {
      throw new Error('unsupported state')
    }
    state = parsed
  } catch (error) {
    if (error?.code !== 'ENOENT') loadReason = 'state_recovered_after_corruption'
    state = {
      schema_version: 1,
      started_at: new Date(now()).toISOString(),
      updated_at: new Date(now()).toISOString(),
      buckets: {},
    }
  }

  let flushTimer = null
  let flushChain = Promise.resolve()

  function bucket() {
    const key = new Date(hourStart(now())).toISOString()
    state.buckets[key] ??= emptyBucket(Date.parse(key))
    return state.buckets[key]
  }

  function prune() {
    const cutoff = hourStart(now()) - RETENTION_HOURS * HOUR_MS
    for (const key of Object.keys(state.buckets)) {
      if (Date.parse(key) < cutoff) delete state.buckets[key]
    }
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flush()
    }, 1000)
    flushTimer.unref?.()
  }

  function flush() {
    prune()
    state.updated_at = new Date(now()).toISOString()
    const body = `${JSON.stringify(state)}\n`
    flushChain = flushChain.then(async () => {
      mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 })
      const tempPath = `${statePath}.${process.pid}.tmp`
      await writeFile(tempPath, body, { mode: 0o600 })
      await chmod(tempPath, 0o600)
      await rename(tempPath, statePath)
    })
    return flushChain
  }

  return {
    recordRender(mode) {
      if (mode === 'sync' || mode === 'async') bucket().renders[mode]++
      scheduleFlush()
    },
    recordCache(result) {
      if (result === 'hit' || result === 'miss') bucket().cache[result]++
      scheduleFlush()
    },
    recordBuild({ result, durationSeconds = 0, outputBytes = 0 }) {
      if (result !== 'success' && result !== 'error') return
      const current = bucket().builds
      current[result]++
      current.duration_count++
      current.duration_seconds_sum += Math.max(0, durationSeconds)
      current.output_bytes_sum += Math.max(0, outputBytes)
      scheduleFlush()
    },
    recordJob(status) {
      if (status in bucket().jobs) bucket().jobs[status]++
      scheduleFlush()
    },
    query({ from, to }) {
      const rows = []
      for (let start = from; start < to; start += HOUR_MS) {
        const key = new Date(start).toISOString()
        const value = state.buckets[key] ?? emptyBucket(start)
        rows.push({ ...value, end: new Date(start + HOUR_MS).toISOString() })
      }
      const reasons = []
      if (loadReason) reasons.push(loadReason)
      if (from < Date.parse(state.started_at)) reasons.push('window_precedes_retained_state')
      if (to > hourStart(now())) reasons.push('window_includes_open_hour')
      return {
        service: { name: 'slidekit', version: serviceVersion },
        bucket: 'hour',
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        rows,
        quality: {
          partial: reasons.length > 0,
          reasons: [...new Set(reasons)],
          retained_since: state.started_at,
          updated_at: state.updated_at,
        },
      }
    },
    async flush() {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      await flush()
    },
  }
}
