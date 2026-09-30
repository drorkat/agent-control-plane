import {
  GitHubClient,
  OpenPrInput,
  OpenPrResult,
  VerifyResult,
} from './github-client.interface';

/**
 * Network-free, deterministic GitHub client used when GITHUB_MOCK=1. It lets
 * the full code loop (connect -> branch -> commit -> pull request) run locally
 * without a real Personal Access Token or any calls to github.com. It never
 * touches the network and never sees a real token.
 */
export class MockGitHubClient implements GitHubClient {
  async verifyToken(): Promise<VerifyResult> {
    return { login: 'acp-mock-user', scopes: 'repo (mock)' };
  }

  async openPullRequest(input: OpenPrInput): Promise<OpenPrResult> {
    return {
      pullRequestUrl: `https://github.com/${input.owner}/${input.repo}/pull/1`,
      branch: input.branch,
      number: 1,
    };
  }
}
