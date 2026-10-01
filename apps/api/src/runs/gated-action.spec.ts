import {
  OPEN_PR_ACTION,
  READ_REPO_ACTION,
  gatedAction,
  gatedActionForProposal,
} from './gated-action';

describe('gatedActionForProposal', () => {
  it('maps a proposal with file edits to open_pull_request (needs approval)', () => {
    expect(
      gatedActionForProposal({
        summary: 'edit',
        files: [{ path: 'a.ts', content: 'x' }],
      }),
    ).toBe(OPEN_PR_ACTION);
  });

  it('maps a null proposal (read-only run) to read_repo (auto)', () => {
    expect(gatedActionForProposal(null)).toBe(READ_REPO_ACTION);
  });

  it('maps an empty-file proposal to read_repo (nothing to land as a PR)', () => {
    expect(gatedActionForProposal({ summary: 'analysis', files: [] })).toBe(
      READ_REPO_ACTION,
    );
  });
});

describe('gatedAction', () => {
  it('uses an explicitly requested governed action, overriding the proposal', () => {
    // Even though the agent produced file edits (which alone would be an
    // open_pull_request), an explicit request_action wins — this is what lets a
    // run reach the blocked / high-risk tiers.
    expect(
      gatedAction('delete_data', {
        summary: 'edit',
        files: [{ path: 'a.ts', content: 'x' }],
      }),
    ).toBe('delete_data');
    expect(gatedAction('merge_pull_request', null)).toBe('merge_pull_request');
  });

  it('falls back to the proposal-derived action when nothing was requested', () => {
    expect(
      gatedAction(undefined, {
        summary: 'edit',
        files: [{ path: 'a.ts', content: 'x' }],
      }),
    ).toBe(OPEN_PR_ACTION);
    expect(gatedAction(undefined, null)).toBe(READ_REPO_ACTION);
  });
});
