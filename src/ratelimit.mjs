// In-memory fixed-window rate limiter. Identity = API key (if present) else
// client IP. `max <= 0` disables. Note: in-memory => per-process only; behind
// multiple instances use a shared store or a proxy-level limiter.
export function createRateLimiter({ windowMs, max, now = () => Date.now() }) {
  const hits = new Map() // id -> { count, reset }

  const sweep = setInterval(
    () => {
      const t = now()
      for (const [id, e] of hits) if (e.reset <= t) hits.delete(id)
    },
    Math.max(windowMs, 1000),
  )
  if (sweep.unref) sweep.unref()

  return {
    enabled: max > 0,
    take(id) {
      if (max <= 0) return { allowed: true, limit: max, remaining: max, reset: 0, retryAfter: 0 }
      const t = now()
      let e = hits.get(id)
      if (!e || e.reset <= t) {
        e = { count: 0, reset: t + windowMs }
        hits.set(id, e)
      }
      e.count++
      return {
        allowed: e.count <= max,
        limit: max,
        remaining: Math.max(0, max - e.count),
        reset: e.reset,
        retryAfter: Math.max(0, Math.ceil((e.reset - t) / 1000)),
      }
    },
    stop() {
      clearInterval(sweep)
    },
  }
}
