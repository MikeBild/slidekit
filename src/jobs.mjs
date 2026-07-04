// In-memory async job store for /render?async=1. Bounded (oldest evicted over
// `max`) with an optional TTL. Results (the built HTML) live here, not on disk.
import { randomUUID } from 'node:crypto'

export function createJobStore({ max = 100, ttlMs = 600000, now = () => Date.now() } = {}) {
  const jobs = new Map() // id -> { id, status, error, etag, html, meta, createdAt, exp }

  let sweep
  if (ttlMs > 0) {
    sweep = setInterval(
      () => {
        const t = now()
        for (const [id, j] of jobs) if (j.exp && j.exp <= t) jobs.delete(id)
      },
      Math.max(ttlMs, 1000),
    )
    if (sweep && sweep.unref) sweep.unref()
  }

  const touch = (j) => {
    j.exp = ttlMs > 0 ? now() + ttlMs : 0
  }

  return {
    create(meta) {
      const id = randomUUID()
      const job = {
        id,
        status: 'queued',
        error: null,
        etag: null,
        html: null,
        meta,
        createdAt: now(),
      }
      touch(job)
      jobs.set(id, job)
      while (jobs.size > max) jobs.delete(jobs.keys().next().value)
      return job
    },
    get(id) {
      const j = jobs.get(id)
      if (!j) return undefined
      if (j.exp && j.exp <= now()) {
        jobs.delete(id)
        return undefined
      }
      return j
    },
    markRunning(id) {
      const j = jobs.get(id)
      if (j) {
        j.status = 'running'
        touch(j)
      }
    },
    setResult(id, html, etag) {
      const j = jobs.get(id)
      if (j) {
        j.status = 'done'
        j.html = html
        j.etag = etag
        touch(j)
      }
    },
    fail(id, error) {
      const j = jobs.get(id)
      if (j) {
        j.status = 'error'
        j.error = error
        touch(j)
      }
    },
    get size() {
      return jobs.size
    },
    stop() {
      if (sweep) clearInterval(sweep)
    },
  }
}

// Is a user-supplied callback URL allowed? Requires http(s) and a host on the
// allowlist (exact host or a subdomain of an allowed host). Empty allowlist =>
// webhooks are disabled (returns false for everything).
export function isAllowedCallback(rawUrl, allow) {
  if (!Array.isArray(allow) || allow.length === 0) return false
  let u
  try {
    u = new URL(rawUrl)
  } catch {
    return false
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  return allow.some((a) => {
    const entry = String(a).toLowerCase()
    return host === entry || host.endsWith('.' + entry)
  })
}
