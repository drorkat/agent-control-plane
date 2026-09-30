# Architecture

Agent Control Plane is a self-hosted application for running AI agents that do
real work on code — under human control. The unit of value is not a chat; it is
a governed **run**: an agent performs a task, its proposed tool actions are
checked by a gateway, risky ones wait for human approval, and everything is
recorded with its cost.

## Monorepo layout

An npm-workspaces monorepo (`apps/*`, `packages/*`):

```
apps/
  api/   NestJS 10 + Prisma 5 — owns the database, auth, the tool gateway,
         the run engine, and all integrations. Serves under /api on :4000.
  web/   Next.js 14 (React 18) + Tailwind — the UI. Talks to the API only,
         over same-origin /api/* which Next proxies to the API. Runs on :3000.
docs/    This documentation.
```

The web app never touches the database directly; PostgreSQL is reached only
through the API.

## Components

```
                          Browser
                             │  same-origin /api/*
                             ▼
                    ┌──────────────────┐
                    │  Web (Next.js)   │ :3000
                    │  i18n en/he RTL  │
                    │  light / dark    │
                    └────────┬─────────┘
                    proxy /api/* → NEXT_PUBLIC_API_URL
                             ▼
                    ┌──────────────────────────────┐
                    │  API (NestJS)  :4000  /api    │
                    │                               │
                    │  Auth (JWT cookie) + RBAC     │
                    │  Tenant context (ALS)         │
                    │  Tool Gateway (policy)        │
                    │  Run engine                   │
                    └──┬────────┬────────┬──────┬───┘
                       │        │        │      │
              ┌────────▼─┐  ┌───▼────┐ ┌─▼────┐ ┌▼───────────┐
              │ Postgres │  │ AI     │ │GitHub│ │ Webhooks + │
              │ (Prisma) │  │ (BYOK) │ │(BYOK)│ │ in-app     │
              │          │  │        │ │      │ │ notifs     │
              └──────────┘  └────────┘ └──────┘ └────────────┘
```

### API feature modules

Assembled in `apps/api/src/app.module.ts`: `auth`, `projects`, `agents`,
`tasks`, `providers`, `ai`, `gateway`, `runs`, `approvals`, `audit`, `github`,
`members`, `invitations`, `webhooks`, `notifications`, and `dashboard`, plus
shared `common` (tenant context + crypto), `prisma`, and a public `health`
controller (`GET /api/health`, used by the container healthcheck).

## Request and tenant model

- **Session.** Login/signup issue a JWT (30-day expiry, signed with
  `AUTH_SECRET`) set as an `httpOnly`, `SameSite=Lax` cookie named `acp_session`.
- **Middleware.** `AuthMiddleware` runs on every request: it verifies the cookie
  and, when valid, runs the rest of the request inside an `AsyncLocalStorage`
  tenant context holding `{ organizationId, userId }`. A missing/invalid token is
  treated as anonymous (it never throws).
- **Guards.** Two global guards run in order: `AuthGuard` (rejects unauthenticated
  requests except those marked `@Public()`), then `RolesGuard` (enforces
  `@Roles(...)` — `owner | admin | member | viewer`). RBAC is enforced
  server-side.
- **Scoping.** Every business row carries `organizationId`. Services read the
  current tenant via `currentOrgId()` from the async context, so queries are
  automatically scoped to the caller's organization. The runtime is effectively
  single-tenant today (a default org is seeded on startup), but the schema is
  tenant-aware throughout.

## Data model

Prisma models (`apps/api/prisma/schema.prisma`) and their relationships:

- **Organization** — the tenant root. Owns everything below.
- **User** — `email`, `passwordHash` (bcrypt), `role`. Belongs to an org.
- **Project** — optionally linked to a GitHub repo (`repoOwner` / `repoName`).
- **Agent** — a `provider` + `model` + `instructions` + `autonomyLevel`; belongs
  to an org, optionally to a project.
- **Task** — work for a project, optionally assigned to an agent; has a status
  lifecycle (`backlog → ready → in_progress → waiting_approval → completed |
  failed`).
- **Run** — one execution of an agent for a task. Records `provider`, `model`,
  `status`, token usage, and `costUsd`.
- **RunEvent** — the ordered event stream for a run (`RUN_CREATED`,
  `MODEL_RESPONSE`, `CONTEXT_READ`, `CHANGES_PROPOSED`, `APPROVAL_REQUESTED`,
  `TOOL_EXECUTED`, `RUN_COMPLETED`, …), with a JSON payload.
- **Approval** — a pending decision for a run's proposed action, with `riskLevel`
  and `status` (`pending | approved | rejected`).
- **AuditLog** — immutable record of who/what did which action on which resource.
- **ProviderCredential** — a BYOK provider API key, stored encrypted
  (`ciphertext` / `iv` / `authTag`, AES-256-GCM) with a `last4` for display.
- **GitHubConnection** — a BYOK GitHub token, encrypted the same way.
- **Webhook** / **WebhookDelivery** — an outbound endpoint (URL, signing
  `secret`, subscribed `events`) and the history of delivery attempts.
- **Notification** — an in-app notification (org-wide when `userId` is null).
- **Invitation** — a single-use, time-limited invite link (`token`) to join an
  org with a given role.

Shape:
`Organization → Users, Projects → Agents, Tasks → Runs → RunEvents`, with
`Approvals`, `AuditLog`, `ProviderCredential`, `GitHubConnection`, `Webhook →
WebhookDelivery`, `Notification`, and `Invitation` all hanging off the
organization.

## The agent run loop

Implemented in `apps/api/src/runs/runs.service.ts`:

```
start(task)
  ├─ create Run (running), agent → working
  ├─ if the project is linked to a repo: read repository context  → CONTEXT_READ
  ├─ call the model via the BYOK provider (complete)              → MODEL_RESPONSE
  ├─ persist token usage + USD cost
  ├─ parse a structured change proposal from the response         → CHANGES_PROPOSED
  └─ Tool Gateway.evaluate(action)
        ├─ auto     → execute, complete the run                   → RUN_COMPLETED
        ├─ approval → create Approval, park the run (waiting_approval), agent → paused
        └─ blocked  → fail the run

resume(approval decision)
  ├─ approved → open a real pull request (branch → commit → PR)   → pull_request.opened
  │             then complete the run                             → RUN_COMPLETED
  └─ rejected → fail the run
```

Every branch records `RunEvent`s and an `AuditLog` entry, and emits lifecycle
events to webhooks and in-app notifications. When a project has no linked repo
(or GitHub can't be reached), the loop falls back to committing a proposal
document instead of real file edits.

### Tool Gateway

`apps/api/src/gateway/` is a single choke point. `GatewayService.evaluate(action)`
looks the action up in a plain-data policy map and returns a decision (`auto` /
`approval` / `blocked`) and a risk level. Examples: `read_repo` / `create_branch`
/ `commit` are `auto`; `open_pull_request` needs `approval`; `merge_pull_request`
and `deploy_production` need `approval` at high risk; `delete_data` is `blocked`.
Unknown actions fall through to a fail-safe default of `approval` at medium risk.

## Integration points

- **BYOK AI providers** (`apps/api/src/ai/`). `ProviderFactory.forAgent(agent)`
  returns an `AIProvider` implementing a single `complete()` contract. With
  `AI_MOCK=1` it returns a network-free mock; otherwise it reads the org's newest
  `ProviderCredential`, decrypts the key in local scope, and constructs the
  Anthropic or OpenAI adapter. The plaintext key never leaves that method.
  Per-model pricing (`ai/pricing.ts`) turns token usage into `costUsd`.
- **GitHub** (`apps/api/src/github/`). `GitHubClientFactory` mirrors the provider
  factory: `GITHUB_MOCK=1` yields a mock client; otherwise it decrypts the org's
  `GitHubConnection` token and builds the real client. The client implements the
  code loop's `openPullRequest({ owner, repo, branch, title, body, files })`
  (branch → commit → PR).
- **Webhook dispatcher** (`apps/api/src/webhooks/`). Fire-and-forget delivery
  that never throws into its caller. Each payload is signed with HMAC-SHA256 over
  the body (`X-ACP-Signature: sha256=<hex>`, `X-ACP-Event: <name>`), delivered
  with a 5s timeout, and recorded as a `WebhookDelivery`. Target URLs are
  SSRF-checked at creation (`assertSafeWebhookUrl`) and re-checked right before
  each fetch (`isBlockedHost`) to defend against DNS rebinding.
- **Notifications** (`apps/api/src/notifications/`). In-app notifications written
  alongside webhook emissions for the same lifecycle events.

## Secret handling

`apps/api/src/common/crypto.ts` provides AES-256-GCM encryption with a 32-byte
key derived (SHA-256) from `ENCRYPTION_KEY` (falling back to `AUTH_SECRET`).
Provider keys and GitHub tokens are stored as ciphertext and decrypted only
in-memory at tool-execution time — never logged, returned by the API, or written
into a `RunEvent` payload.

## Principles

1. **An Agent is not a Model** — an agent can switch providers behind one
   interface.
2. **Nothing runs unchecked** — agents act only through the Tool Gateway
   (permission → policy → approval → execute → audit).
3. **Secrets are never put in a prompt** — they are decrypted only at
   tool-execution time.
4. **Humans stay in control** — risky actions are blocked or parked for approval.
5. **Every significant action is audited.**
6. **Tenant-aware schema** — every row carries `organizationId`.
