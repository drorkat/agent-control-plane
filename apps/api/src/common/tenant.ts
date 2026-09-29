// Single-tenant runtime: for the MVP the whole app operates as one default
// organization. The schema is already tenant-aware (organizationId on every
// row), so multi-org can be layered on later without a data migration.
export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_ORG_SLUG = 'default';
export const DEFAULT_ORG_NAME = 'Default Organization';
