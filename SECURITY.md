# Security Policy

## Trust model — read this first

`POST /render` runs a **real Slidev/Vite build** on the uploaded Markdown. A
Slidev deck can contain `<script setup>` blocks, Vue single-file components,
`setup/` hooks and Vite configuration that **execute during the build**.

> **Uploading Markdown is equivalent to running arbitrary code as the server's
> OS user.** This is inherent to "render exactly like Slidev" and cannot be
> sandboxed away inside the process.

Therefore the built-in controls below are **defense-in-depth, not a sandbox**.

## Deploy safely

- **Require API keys.** Set `SLIDEKIT_API_KEYS` and only hand keys to trusted
  callers. Never expose `/render` unauthenticated on a public network.
- **Put it behind a reverse proxy** with its own auth/WAF/TLS, and set
  `HOST=127.0.0.1` so only the proxy can reach the service.
- **Isolate at the OS level.** Run as a non-root user in an ephemeral, network-
  egress-restricted container or VM, with read-only mounts where possible. Treat
  a compromised build as a compromised host.
- **Keep the limits on.** `SLIDEKIT_MAX_BODY_BYTES`, `SLIDEKIT_BUILD_TIMEOUT_MS`,
  `SLIDEKIT_BUILD_CONCURRENCY`, `SLIDEKIT_BUILD_QUEUE_MAX` and rate limiting bound
  abuse and resource exhaustion — they do **not** contain code execution.

## Built-in mitigations and their limits

| Control                  | Mitigates                | Does **not** mitigate            |
| ------------------------ | ------------------------ | -------------------------------- |
| API-key auth             | unauthenticated abuse    | a malicious authenticated caller |
| Rate limiting            | request floods           | a single malicious deck          |
| Body-size cap (413)      | memory blowups           | code in a small deck             |
| Build timeout (504)      | hung/looping builds      | fast malicious code              |
| Concurrency + queue caps | resource exhaustion      | code execution                   |
| Security headers         | some browser-side issues | server-side execution            |

## Supported versions

The latest release on the default branch is supported. There are no separate
maintenance branches yet.

## Reporting a vulnerability

Please report security issues **privately** to **mike@mikebild.com** rather than
opening a public issue. Include a description, affected version/commit, and
reproduction steps. You'll get an acknowledgement and a fix timeline.
