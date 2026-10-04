import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, PrismaClient } from '@prisma/client';
import { currentOrgId } from '../common/tenant';
import { RLS_ORG_GUC } from './rls';

/**
 * Runtime enforcement of the RLS policies installed by {@link ./rls}. This is the
 * piece documented in docs/RLS.md that turns the (permissive-when-unset) policies
 * into active isolation: before every model operation it sets the per-connection
 * `app.current_org_id` GUC to the current request's org, inside the same
 * transaction as the operation. Combined with a NON-superuser DB role, the
 * database then refuses any row from another org — even if a query forgot its
 * org filter.
 *
 * It is **opt-in** (DB_RLS=1). Default deployments connect as a superuser (which
 * bypasses RLS) and leave this off, so behaviour is unchanged. See docs/RLS.md
 * for the role setup and the bootstrap caveats (signup / seed).
 */

/** True when runtime RLS enforcement is requested. */
export function isRlsEnabled(): boolean {
  return process.env.DB_RLS === '1';
}

/**
 * Set while running inside an app-managed tenant transaction (see
 * {@link runInTenantTx}) that has ALREADY set the GUC for its whole transaction.
 * The per-operation extension checks this so it does not try to open a nested
 * transaction for each statement inside that one — Prisma forbids nesting.
 */
const inManagedTx = new AsyncLocalStorage<boolean>();

/** The SQL that sets the transaction-local org GUC for the current request. */
function setOrgGuc(client: {
  $executeRaw: PrismaClient['$executeRaw'];
}): Prisma.PrismaPromise<number> {
  // `true` => transaction-local: it is reset at COMMIT/ROLLBACK and so never
  // leaks across pooled connections.
  return client.$executeRaw`SELECT set_config(${RLS_ORG_GUC}, ${currentOrgId()}, true)`;
}

/**
 * Wrap a base Prisma client with the tenant-GUC extension. Returns the extended
 * client (a proxy over the base). Model operations run inside a transaction that
 * first sets the GUC; operations already inside a {@link runInTenantTx} just run,
 * since the GUC is set once for that whole transaction.
 */
export function applyRlsExtension(base: PrismaClient) {
  return base.$extends({
    name: 'rls-tenant-guc',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          if (inManagedTx.getStore()) {
            return query(args);
          }
          const [, result] = await base.$transaction([setOrgGuc(base), query(args)]);
          return result;
        },
      },
    },
  });
}

/**
 * Set the transaction-local org GUC on a transaction client. Call it inside a
 * {@link runInManagedTx} once the target org is known. Harmless when enforcement
 * is off. Returns the number of affected rows (always 0 for set_config).
 */
export function setTenantGuc(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  orgId: string = currentOrgId(),
): Promise<number> {
  return tx.$executeRaw`SELECT set_config(${RLS_ORG_GUC}, ${orgId}, true)`;
}

/**
 * Run `fn` inside a single interactive transaction, flagged so the per-operation
 * extension does not try to nest a transaction for each statement. `fn` is
 * responsible for calling {@link setTenantGuc} when the org is known — used by
 * flows (like signup) that only learn the org id after creating it mid-tx.
 */
export function runInManagedTx<R>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<R>,
): Promise<R> {
  return inManagedTx.run(true, () => prisma.$transaction(fn));
}

/**
 * Run `fn` inside one managed transaction that first sets the org GUC, so every
 * statement shares one connection with the GUC applied. Safe when RLS is disabled
 * too: it is then just a normal transaction with a harmless, unused `set_config`.
 *
 * `orgId` defaults to the current request's org, but is passed explicitly for
 * flows that write into an org other than the request context — e.g. accepting
 * an invitation, which runs unauthenticated yet creates a user in the invited
 * org. Setting the GUC to that org is what lets the write pass the policy's
 * WITH CHECK under enforcement.
 */
export function runInTenantTx<R>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<R>,
  orgId: string = currentOrgId(),
): Promise<R> {
  return runInManagedTx(prisma, async (tx) => {
    await setTenantGuc(tx, orgId);
    return fn(tx);
  });
}

/**
 * Run `fn` with the org GUC explicitly empty, which makes the RLS policy
 * permissive (all orgs visible). Use ONLY for inherently cross-org lookups that
 * are gated by a secret or a globally-unique key — e.g. resolving an invitation
 * by its token, or checking global email-uniqueness — where the caller cannot
 * yet be scoped to an org. No-op when enforcement is off.
 */
export function runUnscoped<R>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<R>,
): Promise<R> {
  return runInTenantTx(prisma, fn, '');
}
