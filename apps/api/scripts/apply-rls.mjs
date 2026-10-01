// Install Postgres row-level security on every tenant table.
//
//   npm run db:rls -w @acp/api
//
// Run this as an admin step AFTER the schema exists (after `prisma db push` /
// `db:push`), with a privileged connection — the table owner or a superuser —
// in DATABASE_URL (the same connection you push the schema with). A restricted
// runtime role cannot ALTER the tables.
//
// The statements are idempotent, so re-running is safe (e.g. after a schema
// change that added a tenant table). See docs/RLS.md for the full model,
// including how to actually enforce isolation at runtime (a non-superuser role
// plus setting the app.current_org_id GUC per operation).
import { PrismaClient } from '@prisma/client';
import { rlsStatements, TENANT_TABLES } from '../dist/prisma/rls.js';

const prisma = new PrismaClient();

(async () => {
  console.log(
    `Installing row-level security on ${TENANT_TABLES.length} tenant table(s)…`,
  );
  const statements = rlsStatements();
  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }
  await prisma.$disconnect();
  console.log(
    `Done: ${statements.length} statements applied. RLS is now enabled and ` +
      `FORCEd on every tenant table.\n` +
      `Reminder: isolation only *enforces* for a non-superuser role that sets ` +
      `the app.current_org_id GUC — see docs/RLS.md.`,
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
