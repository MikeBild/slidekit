// OpenAPI 3.1 document generated from a single source-of-truth route registry,
// so the spec cannot drift from the implementation. Theme enum + auth scheme
// are injected dynamically.

export const RENDER_QUERY = [
  {
    name: 'theme',
    schema: { type: 'string' },
    description: 'Theme name (see GET /themes). Unknown values fall back to the default theme.',
  },
  {
    name: 'title',
    schema: { type: 'string' },
    description: 'Deck title -> <title> + og:title/twitter:title + download filename.',
  },
  { name: 'author', schema: { type: 'string' }, description: 'meta[name=author].' },
  {
    name: 'tags',
    schema: { type: 'string' },
    description: 'Comma-separated -> meta[name=keywords].',
  },
  {
    name: 'description',
    schema: { type: 'string' },
    description: 'meta description + og/twitter description.',
  },
  {
    name: 'image',
    schema: { type: 'string', format: 'uri' },
    description: 'Social image URL -> og:image/twitter:image.',
  },
  {
    name: 'imageAlt',
    schema: { type: 'string' },
    description: 'Alt text for the social image -> og:image:alt/twitter:image:alt.',
  },
  {
    name: 'url',
    schema: { type: 'string', format: 'uri' },
    description: 'Canonical URL -> og:url + <link rel=canonical>.',
  },
  { name: 'siteName', schema: { type: 'string' }, description: 'og:site_name.' },
  { name: 'locale', schema: { type: 'string' }, description: 'og:locale (e.g. en_US).' },
  { name: 'lang', schema: { type: 'string' }, description: 'Sets <html lang> (a11y/SEO).' },
  { name: 'robots', schema: { type: 'string' }, description: 'meta[name=robots] (e.g. noindex).' },
  {
    name: 'themeColor',
    schema: { type: 'string' },
    description: 'meta[name=theme-color] (browser UI tint).',
  },
  { name: 'twitterSite', schema: { type: 'string' }, description: 'twitter:site (@handle).' },
  { name: 'twitterCreator', schema: { type: 'string' }, description: 'twitter:creator (@handle).' },
  {
    name: 'favicon',
    schema: { type: 'string' },
    description:
      'Inline favicon: an emoji/short text (rendered to an SVG) or a data: URI. Stays offline.',
  },
  {
    name: 'download',
    schema: { type: 'string', enum: ['1'] },
    description: 'When "1", responds with Content-Disposition: attachment.',
  },
  {
    name: 'async',
    schema: { type: 'string', enum: ['1'] },
    description: 'When "1", enqueue the build and return 202 + a job to poll at GET /jobs/{id}.',
  },
  {
    name: 'callback',
    schema: { type: 'string', format: 'uri' },
    description:
      'Async only: POST {id,status} to this URL on completion. Host must be allowlisted (SLIDEKIT_WEBHOOK_ALLOW).',
  },
]

export const ROUTES = [
  {
    method: 'get',
    path: '/',
    summary: 'Service descriptor (links to /render, /openapi.json, /llms.txt)',
    auth: false,
    responses: { 200: { desc: 'JSON service descriptor', type: 'application/json' } },
  },
  {
    method: 'get',
    path: '/themes',
    summary: 'List available themes',
    auth: false,
    responses: {
      200: {
        desc: 'Theme names',
        type: 'application/json',
        schema: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    method: 'get',
    path: '/health',
    summary: 'Liveness probe (process is up)',
    auth: false,
    responses: {
      200: {
        desc: 'Always "ok" while the process is alive',
        type: 'text/plain',
        schema: { type: 'string', example: 'ok' },
      },
    },
  },
  {
    method: 'get',
    path: '/ready',
    summary: 'Readiness probe (accepting work)',
    auth: false,
    responses: {
      200: { desc: 'Ready', type: 'application/json' },
      503: { desc: 'Draining (graceful shutdown in progress)', type: 'application/json' },
    },
  },
  {
    method: 'get',
    path: '/metrics',
    summary: 'Prometheus metrics',
    auth: false,
    responses: { 200: { desc: 'Metrics in Prometheus text format', type: 'text/plain' } },
  },
  {
    method: 'post',
    path: '/render',
    summary:
      'Render Markdown -> one fully self-contained Slidev HTML deck (CSS+JS+fonts inline, presenter mode, offline)',
    auth: true,
    query: RENDER_QUERY,
    body: {
      required: true,
      description:
        'Raw Slidev Markdown (text/markdown) or a multipart/form-data file field (file/markdown/md).',
      content: {
        'text/markdown': { schema: { type: 'string' } },
        'multipart/form-data': {
          schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
        },
      },
    },
    responses: {
      200: {
        desc: 'Self-contained HTML deck (attachment when download=1); ETag set, 304 on If-None-Match',
        type: 'text/html',
      },
      202: {
        desc: 'Async accepted — job queued (async=1); poll GET /jobs/{id}',
        type: 'application/json',
      },
      400: { desc: 'Empty Markdown, or callback host not allowlisted', type: 'text/plain' },
      401: { desc: 'Missing/invalid API key (when auth enabled)', type: 'text/plain' },
      413: { desc: 'Body too large', type: 'text/plain' },
      429: { desc: 'Rate limit exceeded', type: 'text/plain' },
      500: { desc: 'Build failed', type: 'text/plain' },
      503: { desc: 'Build queue full / queue wait timed out', type: 'text/plain' },
      504: { desc: 'Build timed out', type: 'text/plain' },
    },
  },
  {
    method: 'get',
    path: '/jobs/{id}',
    summary: 'Async job status (queued/running/done/error); includes result link when done',
    auth: true,
    responses: {
      200: { desc: 'Job status JSON', type: 'application/json' },
      401: { desc: 'Missing/invalid API key (when auth enabled)', type: 'text/plain' },
      404: { desc: 'Unknown or expired job', type: 'text/plain' },
    },
  },
  {
    method: 'get',
    path: '/jobs/{id}/result',
    summary: 'Async job result — the self-contained HTML deck once the job is done',
    auth: true,
    responses: {
      200: { desc: 'Self-contained HTML deck (ETag set, 304 on If-None-Match)', type: 'text/html' },
      401: { desc: 'Missing/invalid API key (when auth enabled)', type: 'text/plain' },
      404: { desc: 'Unknown/expired job, or the job failed', type: 'text/plain' },
      409: { desc: 'Job not finished yet — retry', type: 'text/plain' },
    },
  },
  {
    method: 'get',
    path: '/openapi.json',
    summary: 'This OpenAPI 3.1 document',
    auth: false,
    responses: { 200: { desc: 'OpenAPI spec', type: 'application/json' } },
  },
  {
    method: 'get',
    path: '/llms.txt',
    summary: 'LLM docs index (llmstxt.org format)',
    auth: false,
    responses: { 200: { desc: 'Markdown index of the documentation', type: 'text/plain' } },
  },
  {
    method: 'get',
    path: '/llms-full.txt',
    summary: 'Full LLM documentation inlined in one file',
    auth: false,
    responses: { 200: { desc: 'Complete documentation', type: 'text/plain' } },
  },
]

export function buildOpenApi(
  themes,
  { authEnabled = false, defaultTheme = 'neutral', version = '0.0.0' } = {},
) {
  const paths = {}
  for (const r of ROUTES) {
    const op = { summary: r.summary, responses: {} }
    const params = []
    // Path templates like /jobs/{id} need their placeholders declared.
    for (const m of r.path.matchAll(/\{(\w+)\}/g)) {
      params.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } })
    }
    if (r.query) {
      for (const p of r.query) {
        params.push({
          name: p.name,
          in: 'query',
          required: false,
          description: p.description,
          schema:
            p.name === 'theme' ? { type: 'string', enum: themes, default: defaultTheme } : p.schema,
        })
      }
    }
    if (params.length) op.parameters = params
    if (r.body) {
      op.requestBody = {
        required: !!r.body.required,
        description: r.body.description,
        content: r.body.content,
      }
    }
    if (authEnabled && r.auth) op.security = [{ apiKey: [] }, { bearerAuth: [] }]
    for (const [code, res] of Object.entries(r.responses)) {
      op.responses[code] = {
        description: res.desc,
        ...(res.type ? { content: { [res.type]: res.schema ? { schema: res.schema } : {} } } : {}),
      }
    }
    paths[r.path] ??= {}
    paths[r.path][r.method] = op
  }

  const doc = {
    openapi: '3.1.0',
    info: {
      title: 'slidekit API',
      version,
      description: 'Upload Markdown, get back one fully self-contained Slidev HTML deck.',
    },
    servers: [{ url: '/' }],
    paths,
  }
  if (authEnabled) {
    doc.components = {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
    }
  }
  return doc
}
