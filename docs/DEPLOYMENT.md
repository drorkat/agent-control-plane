# Deployment

This guide covers self-hosting Agent Control Plane: a Docker Compose path (the
easiest), a manual/VM path, how to generate secrets, upgrades, backups, and
troubleshooting.

The stack is three parts:

- **db** — PostgreSQL.
- **api** — the NestJS API (`@acp/api`), listens on port `4000`, serves under the
  `/api` prefix, and owns the database and the tool gateway.
- **web** — the Next.js app (`@acp/web`), listens on port `3000`, and proxies
  same-origin `/api/*` requests to the API.

## Prerequisites

- **Docker + Compose** for the container path, or
- **Node.js 22+** and a **PostgreSQL** database for the manual path.

## Generating secrets

Before anything else, set strong secrets in `.env`. Never ship the placeholder
values from `.env.example` to production.

```bash
# A signing secret for session cookies (32+ chars):
openssl rand -base64 48        # use the output as AUTH_SECRET

# A separate key for encrypting stored provider/GitHub secrets (32+ chars):
openssl rand -base64 48        # use the output as ENCRYPTION_KEY
```

Notes:

- `AUTH_SECRET` signs the JWT session cookie. Rotating it invalidates all
  existing sessions (everyone must log in again).
- `ENCRYPTION_KEY` encrypts provider API keys and GitHub tokens at rest
  (AES-256-GCM). Like `AUTH_SECRET`, it is **required**: the API refuses to boot
  (*"Insecure configuration — refusing to start"*) unless it is set, at least 32
  characters, and not one of the `.env.example` placeholders — there is no
  fallback to `AUTH_SECRET`. To **rotate** it safely, put the new value in
  `ENCRYPTION_KEY` and the previous one in `ENCRYPTION_KEY_OLD` (decryption falls
  back to the old key, so nothing breaks), redeploy, then run
  `npm run reencrypt-secrets -w @acp/api` to re-encrypt every stored secret to
  the new key and remove `ENCRYPTION_KEY_OLD`.

## Option A — Docker Compose

The repository ships a `docker-compose.yml` that builds and runs all three
services.

1. Create your environment file and set secrets:

   ```bash
   cp .env.example .env
   # Edit .env: set AUTH_SECRET and ENCRYPTION_KEY (see above).
   # Optionally set POSTGRES_PASSWORD to something strong.
   ```

2. Build and start:

   ```bash
   docker compose up -d --build
   ```

   On first start the `api` container runs `prisma db push` to create the schema,
   then boots. It also seeds a demo owner account (see below).

3. Open **http://localhost:3000** and sign in:

   - **Email:** `admin@acp.local`
   - **Password:** `admin1234`

   Change these by setting `DEFAULT_USER_EMAIL` / `DEFAULT_USER_PASSWORD` in
   `.env` **before the first start** (the password is only set when the user is
   first created), or by creating your own account and removing the demo one.

### How the services talk to each other

- Compose sets the `api` service's `DATABASE_URL` to point at the `db` service
  host (`db:5432`), overriding the `localhost` value that `.env` uses for
  host-based development. The database credentials and this URL are both
  interpolated from the same `.env`, so they stay in sync.
- The `web` service is given `NEXT_PUBLIC_API_URL=http://api:4000`. The browser
  only ever calls same-origin `/api/*`; the Next.js server proxies those calls to
  the API using that value (evaluated at server runtime, see
  `apps/web/next.config.mjs`).

### Running without real keys

Set `AI_MOCK=1` and `GITHUB_MOCK=1` in `.env` to use built-in mock providers.
The full run loop — including branch → commit → pull request — works end to end
with no external network calls. Set them to `0` to use real models and open real
pull requests (add the provider key and GitHub token in the app UI).

### Production notes

- Put a TLS-terminating reverse proxy (nginx, Caddy, Traefik) in front of the
  `web` service and expose only that. You can drop the published `4000` and
  `5432` ports from `docker-compose.yml` so only the web app is reachable.
- The session cookie is `httpOnly` and `SameSite=Lax`; serve the app over HTTPS.
- Keep `WEBHOOK_ALLOW_PRIVATE` unset/`0` (see below).

## Option B — Manual / VM

1. **Database.** Install PostgreSQL and create a database and user, then set
   `DATABASE_URL` in `.env` accordingly, e.g.
   `postgresql://acp:strongpass@localhost:5432/acp?schema=public`.

2. **Install and build:**

   ```bash
   cp .env.example .env      # set DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY
   npm ci
   npm run db:push           # create the schema
   npm run -w @acp/api build # -> apps/api/dist
   npm run -w @acp/web build # -> apps/web/.next
   ```

3. **Run the API** (serves on `API_PORT`, default `4000`):

   ```bash
   node apps/api/dist/main.js
   ```

4. **Run the web app** (serves on `3000`). It must be able to reach the API, so
   set `NEXT_PUBLIC_API_URL` to the API's address:

   ```bash
   NEXT_PUBLIC_API_URL=http://127.0.0.1:4000 npm run -w @acp/web start
   ```

5. **Keep them running** with a process manager (systemd, pm2, …). Run
   `npm run db:push` again after any upgrade that changes the schema.

## `WEBHOOK_ALLOW_PRIVATE` and SSRF

Outbound webhooks let an operator point the server at an arbitrary URL, which is
a classic Server-Side Request Forgery (SSRF) vector. The API therefore refuses
webhook URLs whose host is — or resolves to — a private, loopback, link-local,
CGNAT, or cloud-metadata address (`169.254.169.254`), for both IPv4 and IPv6.
The check runs when a webhook is created **and again immediately before each
delivery**, so a name that later re-points at an internal address (DNS
rebinding) is still blocked.

`WEBHOOK_ALLOW_PRIVATE=1` disables the private-address checks so you can deliver
to `127.0.0.1` or a service on your LAN **during local development**. The
`http(s)`-only requirement still applies. **Leave it unset (or `0`) in
production** — turning it on there re-opens the SSRF hole.

## Upgrading

```bash
git pull

# Docker:
docker compose up -d --build   # the api container re-runs `prisma db push`

# Manual:
npm ci
npm run db:push                # apply any schema changes
npm run -w @acp/api build
npm run -w @acp/web build
# restart both processes
```

Back up your database before upgrading (below). Because the project uses
`prisma db push` (not versioned migrations), review schema changes on a copy
first if you run a large or important dataset.

## Backups

All state lives in PostgreSQL. Provider keys and GitHub tokens are stored
encrypted with `ENCRYPTION_KEY`, so **a database backup is only restorable while
you still have that key** — back it up separately and securely.

```bash
# Docker (dump from the db container):
docker compose exec -T db pg_dump -U acp acp > acp-backup-$(date +%F).sql

# Restore into a fresh database:
docker compose exec -T db psql -U acp -d acp < acp-backup-YYYY-MM-DD.sql
```

For the manual path use your host's `pg_dump` / `psql` against `DATABASE_URL`.
The Docker `pgdata` named volume can also be snapshotted, but a logical
`pg_dump` is the most portable.

For the full procedure — custom-format dumps, `pg_restore`, restore drills,
scheduling/retention, and the encryption-key caveat — see the
[backup & restore runbook](./BACKUP.md).

## Troubleshooting

- **API can't connect to the database.** Check `DATABASE_URL`. In Compose the
  host must be `db`, not `localhost`. Confirm the db is healthy:
  `docker compose ps` and `docker compose logs db`. The API exposes
  `GET /api/health`, which reports `{ "db": "up" | "down" }`.
- **Web shows errors calling the API / 404 on `/api/...`.** The web server
  proxies `/api/*` to `NEXT_PUBLIC_API_URL`. In Compose that must be
  `http://api:4000`; on a VM it must be the API's reachable address. Confirm the
  API is up on port `4000`.
- **"Insecure configuration — refusing to start" on startup.** `AUTH_SECRET`
  and/or `ENCRYPTION_KEY` is missing, shorter than 32 characters, or still a
  `.env.example` placeholder. Set strong, unique values
  (`openssl rand -hex 32`); the error lists exactly which one is wrong.
- **Can't log in with the demo account.** The seed only sets the demo password
  when the user is first created. If you started once with a different
  `DEFAULT_USER_*`, use those credentials, or reset the database.
- **A run fails with "No API key configured" / "GitHub is not connected".** Add
  the provider key or GitHub token in the app (Settings), or set `AI_MOCK=1` /
  `GITHUB_MOCK=1` to use the mocks.
- **A webhook never delivers to a local URL.** That is SSRF protection. Set
  `WEBHOOK_ALLOW_PRIVATE=1` for local development only.
- **Prisma engine / OpenSSL errors in a custom image.** Prisma needs OpenSSL;
  the provided Dockerfiles install it. If you build your own base image, install
  `openssl`.
