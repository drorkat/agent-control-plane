import {
  DEFAULT_POLICY,
  POLICY_MAP,
  PolicyDecision,
  PolicyEntry,
  RiskLevel,
} from './policy';

// The gateway resolves an action exactly this way (POLICY_MAP[action] ??
// DEFAULT_POLICY); replicate it here so we exercise the real fallback without
// instantiating the Nest GatewayService.
function resolvePolicy(action: string): PolicyEntry {
  return POLICY_MAP[action] ?? DEFAULT_POLICY;
}

describe('gateway policy', () => {
  it('treats open_pull_request as requiring approval (medium risk)', () => {
    expect(resolvePolicy('open_pull_request')).toEqual({
      decision: 'approval',
      risk: 'medium',
    });
  });

  it('auto-allows low-risk read/branch/commit actions', () => {
    expect(resolvePolicy('read_repo')).toEqual({ decision: 'auto', risk: 'low' });
    expect(resolvePolicy('create_branch').decision).toBe('auto');
    expect(resolvePolicy('commit').decision).toBe('auto');
  });

  it('requires approval for high-risk merge/deploy actions', () => {
    expect(resolvePolicy('merge_pull_request')).toEqual({
      decision: 'approval',
      risk: 'high',
    });
    expect(resolvePolicy('deploy_production').decision).toBe('approval');
  });

  it('blocks destructive actions outright', () => {
    expect(resolvePolicy('delete_data')).toEqual({
      decision: 'blocked',
      risk: 'critical',
    });
  });

  it('falls back to the fail-safe DEFAULT_POLICY for an unknown action', () => {
    expect(resolvePolicy('some_action_that_does_not_exist')).toBe(DEFAULT_POLICY);
    expect(resolvePolicy('some_action_that_does_not_exist')).toEqual({
      decision: 'approval',
      risk: 'medium',
    });
  });

  it('has a fail-safe default that never auto-allows', () => {
    expect(DEFAULT_POLICY.decision).not.toBe('auto');
    expect(DEFAULT_POLICY.decision).toBe('approval');
  });

  it('every policy entry has a valid decision and risk level', () => {
    const decisions: PolicyDecision[] = ['auto', 'approval', 'blocked'];
    const risks: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    for (const entry of Object.values(POLICY_MAP)) {
      expect(decisions).toContain(entry.decision);
      expect(risks).toContain(entry.risk);
    }
  });
});
