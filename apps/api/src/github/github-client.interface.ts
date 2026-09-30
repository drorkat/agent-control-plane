// The narrow contract the run loop depends on: verify a token, and turn a set
// of files into a real Pull Request. Both a real (GitHub REST) and a mock
// implementation satisfy this, so the whole code loop can be exercised locally
// without a token or network (GITHUB_MOCK=1).

export interface VerifyResult {
  login: string;
  scopes?: string;
}

/** A single file to create or update on the PR branch. `content` is UTF-8 plaintext. */
export interface OpenPrFile {
  path: string;
  content: string;
}

export interface OpenPrInput {
  owner: string;
  repo: string;
  title: string;
  body: string;
  branch: string; // new branch to create, e.g. "acp/run-<id>"
  baseBranch?: string; // defaults to repo default branch when omitted
  files: OpenPrFile[]; // files to create/update on the branch (at least one)
}

export interface OpenPrResult {
  pullRequestUrl: string;
  branch: string;
  number?: number;
}

/** A single entry in a repo's file tree. */
export interface RepoFileRef {
  path: string;
  type: 'file' | 'dir';
}

/** One file's decoded UTF-8 content, with the blob sha it was read at. */
export interface RepoFileContent {
  path: string;
  content: string;
  sha: string;
}

export interface GitHubClient {
  verifyToken(): Promise<VerifyResult>;
  openPullRequest(input: OpenPrInput): Promise<OpenPrResult>;
  /** List file paths in the repo (recursive), for the given ref or default branch. */
  listFiles(owner: string, repo: string, ref?: string): Promise<RepoFileRef[]>;
  /** Read one file's decoded UTF-8 content (+ blob sha), or null if it doesn't exist. */
  getFile(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<RepoFileContent | null>;
}
