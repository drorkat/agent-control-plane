# Security posture

## Application-level hardening (shipped)

- Boot refuses missing/placeholder/short `AUTH_SECRET` / `ENCRYPTION_KEY`.
- RBAC on every write (viewers are read-only); owner-only owner-role grants.
- Secrets encrypted at rest (AES-256-GCM); rotation supported (`ENCRYPTION_KEY_OLD`
  + `npm run reencrypt-secrets`).
- Outbound webhooks are SSRF-guarded and never follow redirects.
- Rate limiting (global + strict on auth), helmet security headers, CORS allowlist,
  `Secure` session cookie in production.
- Structured JSON logs that never include credentials; Prometheus `/metrics`.

## Dependency audit

Run `npm audit` (all) or `npm audit --omit=dev` (what actually ships).

### Fixed
- **Password hashing moved from `bcrypt` to `bcryptjs`.** The native `bcrypt`
  pulled in `@mapbox/node-pre-gyp` → `tar`, which carried two *critical*
  production-tree advisories. `bcryptjs` is pure JS, produces the same `$2a/$2b`
  hashes (existing stored hashes still verify), and removes that whole chain.

### Known / deferred (require a major framework upgrade)
These remain in `npm audit` and are **not** safely fixable without a breaking
major bump, so they are tracked rather than force-applied:

| Advisory source | Severity | Why deferred / mitigation |
| --- | --- | --- |
| `next` (web) | critical + high | Already on the latest Next **14.x**; the advisories are fixed only in Next 15/16 (breaking — React 19 + async request APIs). Most concern features this app does not expose (Image Optimizer `remotePatterns`, i18n middleware, Server Actions on a custom server); the DoS ones are mitigated by running behind an ingress/CDN. Upgrade to Next 16 is the planned fix. |
| `multer` (via `@nestjs/platform-express`) | high | **Dead code** — the app has no file-upload routes (`FileInterceptor`/multipart are unused), so the multer DoS paths are unreachable. Cleared by the Nest 11/12 upgrade. |
| `body-parser` (via `@nestjs/platform-express`) | — | DoS via an invalid `limit`; the app sets a fixed JSON body-size limit. Cleared by the Nest upgrade. |
| `@nestjs/core` / `@nestjs/common` / `file-type` | moderate | Transitive in the Nest HTTP stack; fixed by the Nest 11/12 upgrade. |
| `webpack` (buildHttp SSRF), `inquirer`/`tmp`, `picomatch` (ReDoS) | high/moderate/low | **Dev/build tooling only** (via `@nestjs/cli`/schematics). Never shipped in the runtime image. Cleared by `@nestjs/cli` 12. |

### Planned follow-ups
- Upgrade **Next.js 14 → 16** (web) and **NestJS 10 → 12** (api). Both are
  breaking major migrations and are intentionally out of scope for a patch-level
  security pass; doing them clears every remaining advisory above.
