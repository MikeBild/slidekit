// Tiny in-memory Prometheus-style metrics. No dependencies.
export function createMetrics() {
  const requests = new Map() // key -> { route, status, v }
  let builds = 0
  let buildMs = 0
  let cacheHits = 0
  let cacheMisses = 0

  return {
    requestDone(route, status) {
      const key = `${route}|${status}`
      const e = requests.get(key) || { route, status: String(status), v: 0 }
      e.v++
      requests.set(key, e)
    },
    buildObserved(ms) {
      builds++
      buildMs += ms
    },
    cacheHit() {
      cacheHits++
    },
    cacheMiss() {
      cacheMisses++
    },
    render(inflight) {
      let out = ''
      out += '# HELP slidekit_requests_total Total HTTP requests by route and status.\n'
      out += '# TYPE slidekit_requests_total counter\n'
      for (const { route, status, v } of requests.values()) {
        out += `slidekit_requests_total{route="${route}",status="${status}"} ${v}\n`
      }
      out +=
        '# HELP slidekit_builds_total Total deck builds.\n# TYPE slidekit_builds_total counter\n'
      out += `slidekit_builds_total ${builds}\n`
      out +=
        '# HELP slidekit_build_duration_ms_sum Sum of build durations (ms).\n# TYPE slidekit_build_duration_ms_sum counter\n'
      out += `slidekit_build_duration_ms_sum ${buildMs}\n`
      out +=
        '# HELP slidekit_builds_inflight Builds currently running.\n# TYPE slidekit_builds_inflight gauge\n'
      out += `slidekit_builds_inflight ${inflight}\n`
      out +=
        '# HELP slidekit_cache_hits_total Render cache hits.\n# TYPE slidekit_cache_hits_total counter\n'
      out += `slidekit_cache_hits_total ${cacheHits}\n`
      out +=
        '# HELP slidekit_cache_misses_total Render cache misses.\n# TYPE slidekit_cache_misses_total counter\n'
      out += `slidekit_cache_misses_total ${cacheMisses}\n`
      return out
    },
  }
}
