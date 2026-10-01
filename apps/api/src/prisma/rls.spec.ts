import {
  RLS_ORG_GUC,
  RLS_POLICY,
  TENANT_TABLES,
  rlsStatements,
} from './rls';

describe('rlsStatements', () => {
  const stmts = rlsStatements();

  it('emits ENABLE, FORCE, DROP POLICY, CREATE POLICY for every tenant table', () => {
    expect(stmts).toHaveLength(TENANT_TABLES.length * 4);
    for (const table of TENANT_TABLES) {
      expect(stmts).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(stmts).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      expect(stmts).toContain(`DROP POLICY IF EXISTS "${RLS_POLICY}" ON "${table}"`);
      const create = stmts.find(
        (s) => s.startsWith(`CREATE POLICY "${RLS_POLICY}" ON "${table}"`),
      );
      expect(create).toBeDefined();
      // Keyed on the per-connection GUC, for both reads (USING) and writes (CHECK).
      expect(create).toContain(`current_setting('${RLS_ORG_GUC}', true)`);
      expect(create).toContain('USING (');
      expect(create).toContain('WITH CHECK (');
      // Permissive when the GUC is unset — this is what makes enabling RLS
      // non-breaking for the app, which does not set the GUC by default.
      expect(create).toContain(`coalesce(current_setting('${RLS_ORG_GUC}', true), '') = ''`);
    }
  });

  it('includes the core tenant tables and nothing without organizationId', () => {
    expect(TENANT_TABLES).toEqual(
      expect.arrayContaining(['Project', 'Run', 'Task', 'Approval', 'User']),
    );
    // RunEvent is scoped through its parent Run, so it must not be listed.
    expect(TENANT_TABLES as readonly string[]).not.toContain('RunEvent');
  });
});
