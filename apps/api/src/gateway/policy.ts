// Tool Gateway policy map.
//
// Every proposed tool action an agent wants to take is classified here into a
// gateway decision and a risk level. The run engine consults this to decide
// whether an action runs automatically, pauses the run for a human approval,
// or is refused outright. Keeping the policy as plain data (no I/O, no Nest
// wiring) makes it trivial to unit-test and to extend as new tools appear.

/** What the gateway does with a proposed action. */
export type PolicyDecision = 'auto' | 'approval' | 'blocked';

/** How dangerous an action is, surfaced on approvals and audit records. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PolicyEntry {
  decision: PolicyDecision;
  risk: RiskLevel;
}

/**
 * The action → policy lookup. Actions not listed here fall through to
 * DEFAULT_POLICY, which errs on the side of requiring a human.
 */
export const POLICY_MAP: Record<string, PolicyEntry> = {
  read_repo: { decision: 'auto', risk: 'low' },
  create_branch: { decision: 'auto', risk: 'low' },
  commit: { decision: 'auto', risk: 'low' },
  open_pull_request: { decision: 'approval', risk: 'medium' },
  merge_pull_request: { decision: 'approval', risk: 'high' },
  deploy_production: { decision: 'approval', risk: 'high' },
  delete_data: { decision: 'blocked', risk: 'critical' },
};

/** Unknown actions require approval at medium risk (fail-safe default). */
export const DEFAULT_POLICY: PolicyEntry = { decision: 'approval', risk: 'medium' };
