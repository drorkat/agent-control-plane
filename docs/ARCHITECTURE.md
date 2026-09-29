# Architecture

## What this is

Agent Control Plane is a **self-hosted application** for teams to run and manage AI agents that do real work on code — under human control. The unit of value is not a chat; it is a governed **run**: an agent performs a task, every tool call is checked, risky actions wait for approval, and everything is logged with its cost.

## The core loop (MVP)

```
Task → Agent → reads code, edits on a branch → opens a Pull Request
     → risky actions (merge, deploy) require human approval
     → every action + cost is recorded (audit)
```

If the system does only this, it is already useful. Everything else builds on it.

## In scope for the MVP

- One team (single-tenant runtime; schema is tenant-aware for later).
- Connect a GitHub repository.
- Define an agent (provider + model + instructions), provider-agnostic.
- Create tasks and assign them to an agent.
- Agent run: read repo, make changes on a branch, open a PR.
- Tool Gateway: permission → policy → approval → execute → audit.
- Approvals for risky actions.
- Run timeline, audit log, cost per run.

## Out of scope for now (later phases)

Multi-org / RLS enforcement, multi-agent workflows, RAG / knowledge base, import / adopt existing project, external agents (BYOA), Temporal, MCP, GitLab / Jira, workflow builder, billing, marketplace, client portal, mobile.

## Components

- **web** — Next.js (React) + Tailwind. Talks to the API only; never touches the database directly.
- **api** — NestJS (Node + TypeScript). Owns the database and the Tool Gateway.
- **PostgreSQL** — via Prisma. The single source of truth.

## Data model (initial)

`Organization → Users, Projects → Agents, Tasks → Runs → RunEvents`, plus `Approvals` and `AuditLog`. Every business row carries `organizationId`.

## Principles

1. An Agent is not a Model — an agent can switch providers.
2. Agents never call external systems directly — everything goes through the Tool Gateway.
3. Every significant action is written to the audit log.
4. Secrets are never put in a prompt; they are injected at tool-execution time.
5. External / untrusted content cannot grant an agent new permissions.
6. Tenant-aware schema, single-tenant runtime.

## How this repo is being built

Built by a small, coordinated team of AI agents:

- **Manager** — sets up the foundation, assigns work, integrates parts, keeps everything consistent.
- **Designer** — owns the visual language (modern, accessible, light / dark).
- **Builders (×2)** — each builds a separate feature slice per round.
- **QA** — reviews each slice before it is integrated.
