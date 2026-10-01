// Postgres row-level security (RLS) — a database-level safety net *beneath* the
// app's existing, verified org-scoping (every service query already filters by
// `organizationId: currentOrgId()`). RLS means that even a query that forgot the
// org filter cannot return another tenant's rows, because Postgres itself
// refuses them.
//
// How it works here:
//  - Each tenant table (one that carries `organizationId`) gets ENABLE + FORCE
//    ROW LEVEL SECURITY and a single `tenant_isolation` policy.
//  - The policy compares `organizationId` against a per-connection GUC,
//    `app.current_org_id`, read with `current_setting('app.current_org_id', true)`
//    (the `true` = "missing_ok", so an unset GUC yields NULL rather than error).
//  - The policy is PERMISSIVE WHEN UNSET: if the GUC is empty/unset it allows all
//    rows. This is deliberate and is what makes enabling RLS non-breaking — the
//    app does not set the GUC by default, so behaviour is unchanged. A connection
//    that DOES set the GUC (see docs/RLS.md) is then restricted to that org, at
//    the database level.
//
// Important caveats (see docs/RLS.md):
//  - FORCE makes the policy apply to the table *owner* too. It does NOT apply to
//    a Postgres SUPERUSER — superusers always bypass RLS. The default Docker/CI
//    Postgres runs the app as a superuser, so to actually enforce isolation you
//    must run the app as a dedicated NON-superuser role.
//  - For the running app to restrict itself, it must set `app.current_org_id` per
//    operation (a Prisma client extension); the snippet is in docs/RLS.md. This
//    is opt-in so the default deployment is unaffected.

/** The GUC a connection sets to scope RLS to one organization. */
export const RLS_ORG_GUC = 'app.current_org_id';

/** The single policy name used on every tenant table. */
export const RLS_POLICY = 'tenant_isolation';

/**
 * Tables that carry `organizationId` and therefore get a tenant policy. Child
 * tables (e.g. RunEvent) are reached only through these and are scoped by their
 * parent, so they are intentionally not listed. Keep this in sync with the
 * Prisma schema's `organizationId` columns.
 */
export const TENANT_TABLES = [
  'Agent',
  'Approval',
  'AuditLog',
  'GitHubConnection',
  'Invitation',
  'Notification',
  'Project',
  'ProviderCredential',
  'Run',
  'Schedule',
  'Task',
  'User',
  'Webhook',
] as const;

/** The USING / WITH CHECK predicate: permissive when the GUC is unset. */
const PREDICATE =
  `coalesce(current_setting('${RLS_ORG_GUC}', true), '') = '' ` +
  `OR "organizationId" = current_setting('${RLS_ORG_GUC}', true)`;

/**
 * The idempotent SQL statements (one per array entry) that install RLS on every
 * tenant table. Re-running them is safe: ENABLE/FORCE are no-ops once set, and
 * the policy is dropped-if-exists before being recreated. Each entry is a single
 * statement, suitable for Prisma's `$executeRawUnsafe`.
 */
export function rlsStatements(): string[] {
  const out: string[] = [];
  for (const table of TENANT_TABLES) {
    out.push(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    out.push(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    out.push(`DROP POLICY IF EXISTS "${RLS_POLICY}" ON "${table}"`);
    out.push(
      `CREATE POLICY "${RLS_POLICY}" ON "${table}" ` +
        `USING (${PREDICATE}) WITH CHECK (${PREDICATE})`,
    );
  }
  return out;
}

/** Minimal shape of a Prisma client we need to run the statements. */
export interface RawExecutor {
  $executeRawUnsafe(query: string): Promise<number>;
}

/**
 * Apply the RLS statements against a connected client. Requires a role allowed
 * to ALTER the tables (the owner or a superuser) — i.e. the same privileged
 * connection used for `prisma db push`, not a restricted runtime role.
 */
export async function applyRls(prisma: RawExecutor): Promise<void> {
  for (const stmt of rlsStatements()) {
    await prisma.$executeRawUnsafe(stmt);
  }
}
