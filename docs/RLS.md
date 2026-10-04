# Row-level security (tenant defense-in-depth)

Agent Control Plane already isolates tenants at the application layer: every
service query filters by `organizationId = currentOrgId()`, and an end-to-end
test asserts one org can never read another's data. Postgres **row-level
security (RLS)** adds a second, independent layer *inside the database*: even a
query that forgot the org filter cannot return another tenant's rows, because
Postgres itself refuses them.

This is defense-in-depth — the app-level scoping remains the primary control;
RLS is the backstop.

## What gets installed

`npm run db:rls -w @acp/api` installs, on every tenant table (the 13 tables that
carry `organizationId`), one idempotent policy:

```sql
ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "<table>" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "<table>"
  USING      (coalesce(current_setting('app.current_org_id', true), '') = ''
              OR "organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK (coalesce(current_setting('app.current_org_id', true), '') = ''
              OR "organizationId" = current_setting('app.current_org_id', true));
```

The single source of truth is `apps/api/src/prisma/rls.ts`; the script and the
tests both use it.

### Two design choices that make this safe to adopt

- **`FORCE`** makes the policy apply to the table *owner* too (without it, the
  owner — which is who Prisma usually connects as — would bypass RLS).
- **Permissive when the GUC is unset.** `app.current_org_id` is a per-connection
  setting. When it is empty/unset the policy allows all rows. The application
  does **not** set it by default, so enabling RLS changes nothing about how the
  app behaves today — the whole test suite passes unchanged with RLS installed.
  A connection that *does* set the GUC is then restricted to that one org, at the
  database level.

Apply it as an admin step after the schema exists (it needs a privileged
connection — the owner or a superuser, the same one you run `db:push` with):

```bash
npm run db:push -w @acp/api    # create/sync the schema
npm run db:rls  -w @acp/api    # then install the policies
```

Re-running `db:rls` is safe and is how you pick up a newly added tenant table.

## Enforcing it at runtime (production)

Installing the policies is necessary but not sufficient — two things turn them
from "present" into "enforcing". Both are **opt-in** (set `DB_RLS=1`), so the
default deployment is unchanged.

### 1. Run the app as a non-superuser role

A Postgres **superuser bypasses RLS entirely**, even with `FORCE`. The default
Docker/CI Postgres image runs `POSTGRES_USER` as a superuser, so out of the box
RLS is installed but not enforced. To enforce it, connect the app as a dedicated
role that is **not** a superuser and **not** the table owner. A script
provisions it (run as the owner/admin, i.e. the migration connection):

```bash
APP_DB_USER=acp_app APP_DB_PASSWORD='…' \
  DATABASE_URL=<owner/admin connection> npm run db:rls-role -w @acp/api
```

It creates `acp_app` `NOSUPERUSER NOBYPASSRLS`, grants it CRUD on all tables +
`USAGE, SELECT` on sequences, and sets default privileges for future tables.
Then point the app's `DATABASE_URL` at `acp_app`. Keep using the owner (or a
superuser) only for migrations (`db:migrate`) and `db:rls`, since a restricted
role cannot `ALTER TABLE`.

### 2. Enable the per-operation GUC extension (`DB_RLS=1`)

So the policy knows which org a request belongs to, the app sets
`app.current_org_id` on the same connection each query runs on. This is built in
(`apps/api/src/prisma/rls-extension.ts`): when `DB_RLS=1`, `PrismaService` is a
client extension that wraps every model operation in a transaction which first
sets the GUC to `currentOrgId()` (`true` = transaction-local, so it never leaks
across pooled connections). It adds one round-trip per query, which is why it is
opt-in.

A few flows legitimately run **without** a request org context and are handled
explicitly so they work under enforcement:

- **Signup** creates an org then its owner user in one transaction, setting the
  GUC to the new org before the user insert (`runInManagedTx` + `setTenantGuc`).
- **Login**, the **invitation token preview/accept**, and global email-uniqueness
  checks read **unscoped** (`runUnscoped`, GUC empty → permissive) because they
  resolve a principal by a secret token or globally-unique email before any org
  is known.
- The **startup seed** uses the default org, which equals the fallback
  `currentOrgId()`, so it passes unchanged.

To enforce: provision the role (above), set `DATABASE_URL` to it, set `DB_RLS=1`,
and ensure the policies are installed (`db:rls`).

## How it's verified

`apps/api/test/app.e2e-spec.ts` runs two ways:

- **Default (no `DB_RLS`)** — RLS is installed for the whole suite (proving the
  permissive-when-unset policy is non-breaking), and a dedicated test sets
  `app.current_org_id` by hand to confirm the policy blocks a cross-tenant read
  (under a non-super role directly, or via a throwaway `NOSUPERUSER` role + `SET
  LOCAL ROLE` when the DB role is a superuser).
- **Enforced (`DB_RLS=1`, the `rls-enforcement` CI job)** — the owner installs
  the schema, policies, and the `acp_app` role, then the *entire* suite runs as
  that non-superuser role with the extension active. Same-tenant work succeeds
  and the "multi-tenant isolation" test proves cross-tenant reads are refused by
  the database. (The raw-SQL policy probe is skipped here, since it deliberately
  seeds rows without a context.)

## See also

- [docs/DEPLOYMENT.md](./DEPLOYMENT.md) — roles, secrets, self-hosting.
- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) — the multi-tenant data model.
