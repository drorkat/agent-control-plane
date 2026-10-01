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

Installing the policies is necessary but not sufficient — two more things turn
them from "present" into "enforcing":

### 1. Run the app as a non-superuser role

A Postgres **superuser bypasses RLS entirely**, even with `FORCE`. The default
Docker/CI Postgres image runs `POSTGRES_USER` as a superuser, so out of the box
RLS is installed but not enforced. To enforce it, connect the app as a dedicated
role that is **not** a superuser and **not** the table owner:

```sql
-- As an admin/owner, once:
CREATE ROLE acp_app LOGIN PASSWORD '…' NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO acp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO acp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO acp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO acp_app;
```

Point the app's `DATABASE_URL` at `acp_app`. Keep using the owner (or a
superuser) only for migrations (`db:push`) and `db:rls`, since a restricted role
cannot `ALTER TABLE`.

### 2. Set `app.current_org_id` per operation

So the policy knows which org the current request belongs to, the app must set
the GUC on the same connection each query runs on. With Prisma this is a client
extension that wraps each operation in a transaction, setting the GUC first
(`true` = transaction-local, so it never leaks across pooled connections):

```ts
import { PrismaClient } from '@prisma/client';
import { currentOrgId } from './common/tenant';

const base = new PrismaClient();

export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const orgId = currentOrgId();
        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`,
          query(args),
        ]);
        return result;
      },
    },
  },
});
```

This is intentionally **not** wired into the default runtime: it only has an
effect behind a non-superuser role (above), it adds a round-trip per query, and
the extended client changes injection wiring. Adopt it deliberately, as part of
moving to the `acp_app` role, rather than by default.

## How it's verified

`apps/api/test/app.e2e-spec.ts` installs RLS for the whole integration suite
(proving the permissive-when-unset policy is non-breaking) and adds a dedicated
test that sets `app.current_org_id` and confirms a read returns only the matching
org's rows and none of another org's — the database blocking the cross-tenant
read. The test evaluates the policy under a non-superuser context (directly when
the DB role is already non-super, or via a throwaway `NOSUPERUSER` role + `SET
LOCAL ROLE` when the role is a superuser, e.g. on CI).

## See also

- [docs/DEPLOYMENT.md](./DEPLOYMENT.md) — roles, secrets, self-hosting.
- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) — the multi-tenant data model.
