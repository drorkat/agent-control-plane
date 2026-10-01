# Agent Control Plane

> An open-source, self-hosted **control plane for AI agents**. Bring your own models.

Agent Control Plane is a self-hosted application for running AI agents that do
**real work on your code** — read a repository, propose concrete edits, and open
a pull request — while a human stays in control of anything risky. It is not a
chatbot and not a single coding agent: it is the governance layer _around_
agents, giving you tasks, a tool gateway, human approvals, an immutable audit
log, role-based access, and outbound webhooks.

Every proposed tool action passes through a gateway (permission → policy →
approval → execute → audit), so an agent can open a PR automatically but must
wait for a human before anything higher-risk. Provider keys and GitHub tokens
are yours (BYOK) and are encrypted at rest.

**Status:** early development, built in the open.

## Features

**Agents & runs**
- A real code-reading run loop: read repository context → call the model →
  produce a **structured change proposal** → open a real pull request
  (branch → commit → PR) once approved.
- Provider-agnostic agents (an Agent is a role + model, not a single vendor).
- Per-run token usage and USD cost tracking, and a full event timeline per run.

**Governance**
- **Tool Gateway** — every proposed action is classified `auto` / `approval` /
  `blocked` with a risk level; unknown actions fail safe to "requires approval".
- **Human approvals** — risky actions (open/merge PR, deploy) park the run until
  a reviewer approves or rejects.
- **Immutable audit log** — who/what did which action on which resource, when.

**Access**
- Email + password authentication with an httpOnly JWT session cookie.
- Organization multi-tenant data model (every record carries an organization).
- Role-based access control enforced server-side (roles: owner, admin, member,
  viewer).
- Invite links to add teammates to an organization.

**Integrations**
- **BYOK provider keys** (Anthropic, OpenAI) added in the UI and encrypted at
  rest (AES-256-GCM).
- **GitHub connection** via a personal access token, encrypted at rest, used
  only at execution time to open pull requests.
- **Signed outbound webhooks** (HMAC-SHA256, `X-ACP-Signature`) with SSRF
  protection, plus in-app notifications.

**UX**
- Modern web UI with full **English / Hebrew (RTL)** localization and
  **light / dark** themes.

## Tech stack

- **Language:** Node.js + TypeScript (npm workspaces monorepo)
- **API:** NestJS 10
- **Web:** Next.js 14 (React 18) + Tailwind CSS
- **Database:** PostgreSQL via Prisma 5

## Quick start (Docker)

Requirements: Docker with Compose. This runs the whole stack — Postgres, the
API, and the web app.

```bash
cp .env.example .env
# Edit .env and set strong values for AUTH_SECRET and ENCRYPTION_KEY (32+ chars).
# To try it out with no real API keys, also set AI_MOCK=1 and GITHUB_MOCK=1.

docker compose up -d --build
```

Then open **http://localhost:3000** and sign in with the seeded demo account:

- **Email:** `admin@acp.local`
- **Password:** `admin1234`

The API creates the database schema and seeds this demo owner on first start.
With `AI_MOCK=1` and `GITHUB_MOCK=1` you can exercise the full run loop
(including the connect → branch → commit → pull request flow) without any real
provider key or GitHub token. Set them back to `0` to use real models and open
real pull requests.

## Local development (without Docker)

Requirements: **Node.js 22+** (see `.nvmrc`) and a PostgreSQL database.

```bash
cp .env.example .env
# Point DATABASE_URL at your Postgres, and set AUTH_SECRET + ENCRYPTION_KEY.

# Need a database quickly? Start just Postgres from the compose file:
docker compose up -d db

npm install                # installs all workspaces (also generates the Prisma client)
npm run db:push            # create/sync the database schema
npm run dev                # runs the API (:4000) and web (:3000) together
```

`npm run dev` uses `concurrently` to start `@acp/api` (NestJS, watch mode) and
`@acp/web` (Next.js) at once. The web app calls same-origin `/api/*`, which
Next.js proxies to the API (see `apps/web/next.config.mjs`).

Other root scripts: `npm run build` (build both apps), `npm run db:generate`
(regenerate the Prisma client), `npm run db:studio` (open Prisma Studio).

## Configuration

Copy `.env.example` to `.env` and adjust. The variables the project reads:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | PostgreSQL connection string used by Prisma. |
| `AUTH_SECRET` | yes | — | Secret that signs JWT session cookies. Must be 32+ random chars and not a known placeholder — the API **refuses to boot** otherwise. Generate with `openssl rand -hex 32`. |
| `ENCRYPTION_KEY` | yes | — | Key used to encrypt stored provider/GitHub secrets at rest (AES-256-GCM). Required, 32+ chars, not a placeholder (boot fails otherwise). Set it once — changing it makes already-stored secrets undecryptable. |
| `WEB_ORIGIN` | no | — | Comma-separated CORS allowlist for cross-origin browser calls. Unset = CORS off (the web app talks to the API same-origin via Next.js rewrites). An arbitrary origin is never reflected with credentials. |
| `COOKIE_SECURE` | no | `0` in dev, on in prod | `1` forces the `Secure` flag on the session cookie (always on when `NODE_ENV=production`). |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | for Docker | `acp` / `acp_dev_password` / `acp` | Credentials for the bundled Postgres container. |
| `API_PORT` | no | `4000` | Port the API listens on. |
| `NEXT_PUBLIC_API_URL` | no | `http://localhost:4000` | Where the web server proxies `/api/*`. In Docker this is set to `http://api:4000`. |
| `LOG_LEVEL` | no | `info` | pino log level (`trace`…`fatal`). Logs are structured JSON with a per-request id; metrics are at `GET /api/metrics` (Prometheus). |
| `AI_MOCK` | no | `0` | `1` uses a built-in mock AI provider — no network, no key. |
| `GITHUB_MOCK` | no | `0` | `1` uses a built-in mock GitHub client — no network, no token. |
| `WEBHOOK_ALLOW_PRIVATE` | no | `0` | **Local dev only.** `1` allows webhooks to private/loopback/link-local addresses. Leave unset in production so SSRF protection stays on. |
| `DEFAULT_USER_EMAIL` / `DEFAULT_USER_PASSWORD` | no | `admin@acp.local` / `admin1234` | Override the seeded demo owner created on first start. |

Provider keys are **added in the app** (Settings → AI Providers) and stored
encrypted at rest — there are no `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env vars,
and the server never reads provider keys from the environment. GitHub is likewise
connected through the UI with a token that is encrypted at rest.

## Security notes

- **Secrets encrypted at rest** — provider API keys and GitHub tokens are stored
  with AES-256-GCM and decrypted only in-memory at tool-execution time; they are
  never logged, returned by the API, or written into run event payloads.
- **Signed webhooks** — each delivery is signed with HMAC-SHA256 over the body
  and sent as `X-ACP-Signature: sha256=<hex>` so receivers can verify it.
- **SSRF-guarded webhooks** — webhook URLs are validated at creation and
  re-checked at delivery (defending against DNS rebinding); private, loopback,
  link-local, CGNAT, and cloud-metadata addresses are refused unless
  `WEBHOOK_ALLOW_PRIVATE=1` is set for local development.
- **Server-side RBAC** — authentication and role checks run as global guards on
  every request; the session is an httpOnly, SameSite=Lax cookie.
- **Human-in-the-loop** — the tool gateway blocks or parks risky actions for a
  human before an agent can act.

## Documentation

- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) — self-hosting guide (Docker and manual/VM).
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — how the system fits together.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — developing and contributing.

## License

[AGPL-3.0](./LICENSE). If you run a modified version as a network service, you
must make your changes available under the same license.
