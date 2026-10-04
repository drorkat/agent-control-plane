import {
  GitHubClient,
  MergePrResult,
  OpenPrInput,
  OpenPrResult,
  RepoFileContent,
  RepoFileRef,
  VerifyResult,
} from './github-client.interface';

/**
 * Network-free, deterministic GitHub client used when GITHUB_MOCK=1. It lets
 * the full code loop (connect -> read files -> branch -> commit -> pull request)
 * run locally without a real Personal Access Token or any calls to github.com.
 * It never touches the network and never sees a real token.
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

  async mergePullRequest(
    _owner: string,
    _repo: string,
    pullNumber: number,
  ): Promise<MergePrResult> {
    return {
      merged: true,
      sha: `mock-merge-sha-${pullNumber}`,
      message: 'Pull Request successfully merged (mock)',
    };
  }

  /** A small, fixed file tree so context-gathering has something to work with. */
  async listFiles(): Promise<RepoFileRef[]> {
    return [
      { path: 'README.md', type: 'file' },
      { path: 'package.json', type: 'file' },
      { path: 'src/index.ts', type: 'file' },
      { path: 'src/utils.ts', type: 'file' },
    ];
  }

  /** Deterministic fake content per known path; a generic line for anything else. */
  async getFile(
    _owner: string,
    repo: string,
    path: string,
  ): Promise<RepoFileContent | null> {
    return { path, content: mockContent(repo, path), sha: `mock-sha-${path}` };
  }
}

/** Fixed, human-plausible content for the mock tree's paths. */
function mockContent(repo: string, path: string): string {
  switch (path) {
    case 'README.md':
      return `# ${repo}\n\nA sample repository.\n`;
    case 'package.json':
      return `{\n  "name": "${repo}",\n  "version": "1.0.0"\n}\n`;
    case 'src/index.ts':
      return `export function main() {\n  console.log('hello');\n}\n`;
    case 'src/utils.ts':
      return `export function add(a: number, b: number): number {\n  return a + b;\n}\n`;
    default:
      return `// ${path}\n`;
  }
}
