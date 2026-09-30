import { Injectable } from '@nestjs/common';
import { DEFAULT_POLICY, POLICY_MAP, PolicyDecision } from './policy';

/**
 * The Tool Gateway. Given a proposed tool action, returns the policy decision
 * (auto / approval / blocked) and its risk level. This is the single choke
 * point the run engine calls before letting an agent act.
 */
@Injectable()
export class GatewayService {
  evaluate(action: string): { decision: PolicyDecision; risk: string } {
    const entry = POLICY_MAP[action] ?? DEFAULT_POLICY;
    return { decision: entry.decision, risk: entry.risk };
  }
}
