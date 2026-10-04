// Create (or update) a NON-superuser application role for RLS enforcement.
//
//   APP_DB_USER=acp_app APP_DB_PASSWORD=... \
//     DATABASE_URL=<owner/admin connection> npm run db:rls-role -w @acp/api
//
// Run it as the schema OWNER (the same privileged connection used for
// migrations), after the schema exists. It:
//   - creates the role LOGIN NOSUPERUSER NOBYPASSRLS (so RLS actually applies),
//   - grants CRUD on all current tables + USAGE/SELECT on sequences,
//   - sets DEFAULT PRIVILEGES so future tables created by the owner are covered.
//
// Then point the app's DATABASE_URL at this role and set DB_RLS=1. Keep using
// the owner/superuser only for migrations and `db:rls`. See docs/RLS.md.
import { PrismaClient } from '@prisma/client';

const roleName = process.env.APP_DB_USER;
const password = process.env.APP_DB_PASSWORD;

if (!roleName || !password) {
  console.error(
    'Set APP_DB_USER and APP_DB_PASSWORD (and DATABASE_URL to an owner/admin connection).',
  );
  process.exit(1);
}
// The role name is interpolated into DDL (identifiers cannot be bound params),
// so restrict it to a safe identifier to avoid any injection.
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(roleName)) {
  console.error(
    `APP_DB_USER "${roleName}" is not a valid SQL identifier (use letters, digits, underscore; must not start with a digit).`,
  );
  process.exit(1);
}

// Optional: whose future-created tables the default privileges apply to. Defaults
// to the connecting role (which should be the migration owner).
const ownerRole = process.env.APP_DB_OWNER;
if (ownerRole && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(ownerRole)) {
  console.error(`APP_DB_OWNER "${ownerRole}" is not a valid SQL identifier.`);
  process.exit(1);
}

// Postgres string literal: double any single quotes (standard_conforming_strings
// is on by default, so backslashes are literal).
const pwLiteral = `'${password.replace(/'/g, "''")}'`;
const forRole = ownerRole ? `FOR ROLE "${ownerRole}" ` : '';

const prisma = new PrismaClient();

(async () => {
  const statements = [
    `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${roleName}') THEN CREATE ROLE "${roleName}" LOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$`,
    `ALTER ROLE "${roleName}" WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${pwLiteral}`,
    `GRANT USAGE ON SCHEMA public TO "${roleName}"`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${roleName}"`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${roleName}"`,
    `ALTER DEFAULT PRIVILEGES ${forRole}IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${roleName}"`,
    `ALTER DEFAULT PRIVILEGES ${forRole}IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${roleName}"`,
  ];

  console.log(`Provisioning application role "${roleName}" (NOSUPERUSER)…`);
  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }
  await prisma.$disconnect();
  console.log(
    `Done. Point the app's DATABASE_URL at "${roleName}" and set DB_RLS=1 to ` +
      `enforce tenant isolation at the database. Keep migrations + db:rls on the ` +
      `owner/superuser connection.`,
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
