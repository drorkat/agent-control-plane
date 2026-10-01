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
- Tenant isolation enforced in the app (every query is org-scoped), with optional
  Postgres row-level security as a database-level backstop (`npm run db:rls`; see
  [RLS.md](./RLS.md)).

## Dependency audit

Run `npm audit` (all) or `npm audit --omit=dev` (what actually ships).
**Current status: `npm audit` reports 0 vulnerabilities.**

### How it got there
- **Password hashing moved from `bcrypt` to `bcryptjs`.** The native `bcrypt`
  pulled in `@mapbox/node-pre-gyp` → `tar`, which carried two *critical*
  production-tree advisories. `bcryptjs` is pure JS, produces the same `$2a/$2b`
  hashes (existing stored hashes still verify), and removes that whole chain.
- **API upgraded to NestJS 11 (Express 5).** This replaced the vulnerable
  `multer` / `body-parser` transitives and the Nest HTTP-stack advisories
  (`@nestjs/core`/`common`, `file-type`). `@nestjs/cli` 11 also moved the
  dev-only `webpack` (buildHttp SSRF) / `inquirer` / `tmp` / `picomatch`
  advisories past their fixes. (Nest 11 rather than 12: `nestjs-pino` and
  `@nest-lab/throttler-storage-redis` only peer-support up to `^11`, and
  `@nestjs/schematics` 12 requires TypeScript ≥6 — 11 already carries Express 5.)
- **Web upgraded to Next.js 16 + React 19**, clearing the `next` critical + high
  advisories. `@playwright/test` bumped to 1.55.1 to clear a dev-only
  browser-download SSL advisory.

Both framework upgrades needed **no application source changes** and are covered
by CI (unit, API integration, and browser E2E jobs).
