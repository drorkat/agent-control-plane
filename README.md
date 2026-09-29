# Agent Control Plane

> An open-source **control plane** for AI agents. Self-hosted. Bring your own models.

Agent Control Plane is a self-hosted application for teams to **run and manage AI agents** that do real work on their code — under human control. It is not another chatbot or a single coding agent: it is the layer _around_ agents that gives you **tasks, tool permissions, approvals, cost tracking and an audit trail**, so an agent can open a pull request while a human stays in charge of anything risky.

**Status:** early development (pre-alpha), built in the open.

## The core loop

```
Task → Agent works → reads code, edits on a branch → opens a Pull Request
     → risky actions (merge, deploy) wait for human approval
     → everything is logged, with cost
```

## Why

Closed agents (Devin, Copilot) can't be self-hosted, and agent frameworks (LangGraph, CrewAI) are libraries, not a ready-to-run application. Agent Control Plane is the **self-hosted app** that wraps the agents your team already trusts and adds the governance layer: permissions, approvals, audit and cost.

## Principles

- **Provider-agnostic** — Anthropic, OpenAI, local models, behind one interface. An Agent is not a Model.
- **Nothing runs unchecked** — every tool call passes a gateway: permission → policy → approval → execute → audit.
- **Secrets never go into a prompt** — injected only at tool-execution time.
- **Human stays in control** — dangerous actions require approval; agents can be paused.
- **Tenant-aware schema, single-tenant runtime** — ready to grow to multi-org later, simple to run today.

## Tech stack

- **Web:** Next.js (React) + Tailwind CSS
- **API:** NestJS (Node.js + TypeScript)
- **Database:** PostgreSQL (via Prisma)
- **Local dev infra:** Docker Compose

## Quick start

Requirements: Node.js 22+, Docker.

```bash
cp .env.example .env
docker compose up -d          # starts PostgreSQL (+ Adminer on :8080)
npm install
npm run db:push               # create the database schema
npm run dev                   # starts API (:4000) and web (:3000)
```

Then open http://localhost:3000

## Repository layout

```
apps/
  web/     Next.js front-end (talks to the API only)
  api/     NestJS back-end (owns the database + tool gateway)
docs/
  ARCHITECTURE.md
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Contributions are welcome under the DCO.

## License

[AGPL-3.0](./LICENSE) © contributors. If you run a modified version as a network service, you must publish your changes.
