import {
  OPEN_PR_ACTION,
  READ_REPO_ACTION,
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
