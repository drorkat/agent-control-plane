# Backup & restore runbook

All durable state in Agent Control Plane lives in **one place: PostgreSQL**. The
API is stateless, the web app is stateless, and the rate-limiter's Redis (if you
run it) holds only ephemeral counters. So backing up the system means backing up
the database — plus one secret, described next.

> [!IMPORTANT]
> **The database alone is not enough to restore.** Provider API keys and GitHub
> tokens are stored **encrypted at rest** with `ENCRYPTION_KEY` (AES-256-GCM). A
> database backup therefore contains only ciphertext for those columns: without
> the matching `ENCRYPTION_KEY` the stored secrets are unrecoverable and every
> affected agent/connection must be re-entered by hand. **Back up
> `ENCRYPTION_KEY` separately and securely** (a secrets manager, not next to the
> dump). `AUTH_SECRET` is worth keeping too — losing it only forces everyone to
> log in again (sessions are invalidated), so it is not as critical.

## What to back up

| Item | Where it is | How often |
| --- | --- | --- |
| PostgreSQL database | the `db` service / your Postgres | per the schedule below |
| `ENCRYPTION_KEY` | your `.env` / secrets manager | once, and on every rotation |
| `AUTH_SECRET` | your `.env` / secrets manager | once (optional but recommended) |

Nothing else needs backing up: the code is in git, and the schema is recreated
from Prisma on API start.

## Taking a backup (`pg_dump`)

Use PostgreSQL's **custom format** (`-Fc`) — it is compressed and restores with
`pg_restore` (selective, parallel, order-independent). The commands assume the
default credentials from `.env` (`POSTGRES_USER=acp`, `POSTGRES_DB=acp`); adjust
if you changed them.

### Docker Compose

```bash
# Dump the `db` service to a compressed custom-format file on the host.
docker compose exec -T db pg_dump -U acp -Fc acp > acp-$(date +%F).dump

# Plain-SQL alternative (human-readable, less flexible to restore):
docker compose exec -T db pg_dump -U acp acp > acp-$(date +%F).sql
```

### Manual / VM (Postgres reachable via `DATABASE_URL`)

```bash
# pg_dump reads the standard PG* vars or a connection string:
pg_dump "$DATABASE_URL" -Fc > acp-$(date +%F).dump
```

Store dumps off-box (object storage, a backup host) and encrypt them in transit
and at rest — a dump still contains all your organizations' data.

## Restoring

Restoring replaces the current data, so only do it into a database you intend to
overwrite (or a fresh one). **Make sure the target deployment uses the same
`ENCRYPTION_KEY`** as when the dump was taken, or stored provider/GitHub secrets
will not decrypt.

### Docker Compose

```bash
# Custom-format dump -> pg_restore. --clean --if-exists drops existing objects
# first so a restore over an existing database is idempotent.
docker compose exec -T db pg_restore -U acp -d acp --clean --if-exists < acp-YYYY-MM-DD.dump

# Plain-SQL dump -> psql:
docker compose exec -T db psql -U acp -d acp < acp-YYYY-MM-DD.sql
```

### Manual / VM

```bash
pg_restore "$DATABASE_URL" --clean --if-exists < acp-YYYY-MM-DD.dump
# or, for a plain-SQL dump:
psql "$DATABASE_URL" < acp-YYYY-MM-DD.sql
```

After a restore, (re)start the API. On boot it runs `prisma db push` to reconcile
the schema, so restoring an older dump and starting a newer API build brings the
schema up to date automatically. Confirm health:

```bash
curl -fsS http://localhost:4000/api/health      # expect {"status":"ok","db":"up",...}
```

## Volume snapshots (alternative)

The Compose database persists to the `pgdata` named volume, so you can also
snapshot that volume (or the underlying disk) instead of a logical dump. It is
faster for very large databases but less portable (tied to the Postgres major
version and platform) and must be taken against a stopped db or a
filesystem-consistent snapshot. A logical `pg_dump` is the recommended default;
reach for volume snapshots only when dump/restore time becomes a problem.

## Verifying backups (restore drill)

A backup you have never restored is a guess. Periodically prove it:

```bash
# Restore the dump into a throwaway database and check the row counts look sane.
docker compose exec -T db createdb -U acp acp_restore_test
docker compose exec -T db pg_restore -U acp -d acp_restore_test --no-owner < acp-YYYY-MM-DD.dump
docker compose exec -T db psql -U acp -d acp_restore_test -c '\dt'      # tables present?
docker compose exec -T db dropdb -U acp acp_restore_test                # clean up
```

For a full drill, point a scratch API instance (same `ENCRYPTION_KEY`) at the
restored database and confirm you can log in and that a provider key decrypts
(e.g. start a run).

## Scheduling & retention

Run dumps on a schedule and keep a sensible window (e.g. daily for 7 days,
weekly for a month). A minimal host cron entry:

```cron
# Daily at 02:17, keep the last 7 daily dumps.
17 2 * * * cd /opt/agent-control-plane && docker compose exec -T db pg_dump -U acp -Fc acp > "/var/backups/acp/acp-$(date +\%F).dump" && find /var/backups/acp -name 'acp-*.dump' -mtime +7 -delete
```

Match the frequency to how much work you can afford to lose; the dumps are small
until you accumulate many runs and audit entries.

## Rotating `ENCRYPTION_KEY`

You do not need a restore to rotate the key. Set the new value in
`ENCRYPTION_KEY`, keep the previous one in `ENCRYPTION_KEY_OLD` (decryption falls
back to it so nothing breaks), redeploy, then migrate every stored secret to the
new key and remove the old one:

```bash
npm run reencrypt-secrets -w @acp/api
# then clear ENCRYPTION_KEY_OLD and redeploy
```

See the `ENCRYPTION_KEY` / `ENCRYPTION_KEY_OLD` rows in the
[configuration table](../README.md#configuration).

## See also

- [docs/DEPLOYMENT.md](./DEPLOYMENT.md) — self-hosting, secrets, upgrades.
- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) — what stores what.
