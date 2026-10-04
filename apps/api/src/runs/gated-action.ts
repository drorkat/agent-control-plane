import { ChangeProposal } from './change-proposal';

/**
 * The gateway actions a run can propose. `read_repo` covers a run that only
 * read/analyzed the code and proposed no edits (low-risk, auto); `open_pull_request`
 * covers a run that produced concrete file changes to land as a PR (needs approval).
 */
export const READ_REPO_ACTION = 'read_repo';
export const OPEN_PR_ACTION = 'open_pull_request';
/** A human-approved merge of an existing pull request (executed for real). */
export const MERGE_PR_ACTION = 'merge_pull_request';

/**
 * Decide which tool action the Tool Gateway should evaluate for a finished run,
 * from what the agent actually produced. This is what makes governance real
 * rather than "everything needs approval": a run that only read the repo and
 * proposed nothing to change maps to `read_repo` (auto-completes), while a run
 * that proposed one or more file edits maps to `open_pull_request` (parks for a
 * human, since opening a PR is the impactful action).
 */
export function gatedActionForProposal(
  proposal: ChangeProposal | null,
): string {
  return proposal && proposal.files.length > 0
    ? OPEN_PR_ACTION
    : READ_REPO_ACTION;
}

/**
 * Pick the gateway action for a finished run. When the agent explicitly
 * requested a governed action (a `request_action` loop step — e.g.
 * `merge_pull_request` or `delete_data`), THAT is what the gateway evaluates;
 * this is how a run reaches the blocked / high-risk tiers instead of only the
 * read_repo / open_pull_request ones. Otherwise the action is derived from the
 * proposal (see {@link gatedActionForProposal}).
 */
export function gatedAction(
  requestedAction: string | undefined,
  proposal: ChangeProposal | null,
): string {
  return requestedAction ?? gatedActionForProposal(proposal);
}
