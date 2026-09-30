import {
  GitHubClient,
  OpenPrFile,
  OpenPrInput,
  OpenPrResult,
  VerifyResult,
} from './github-client.interface';

const BASE_URL = 'https://api.github.com';

/**
 * Real GitHub REST client. The Personal Access Token is supplied at
 * construction time (decrypted by GitHubClientFactory) and kept private to this
 * instance — it is only ever sent to GitHub in the `Authorization` header, and
 * is never logged, returned, or included in a thrown error.
 *
 * Uses the global `fetch` (Node 18+), so there is no SDK dependency — the same
 * approach the AI provider adapters take.
 */
export class RealGitHubClient implements GitHubClient {
  constructor(private token: string) {}

  /**
   * Confirm the token works and report who it belongs to. GitHub returns the
   * token's granted scopes in the `x-oauth-scopes` response header.
   */
  async verifyToken(): Promise<VerifyResult> {
    const res = await this.request('GET', '/user');
    if (!res.ok) {
      throw await this.githubError(res, 'GitHub token verification failed');
    }
    const body = (await res.json()) as { login?: string };
    return {
      login: body.login ?? '',
      scopes: res.headers.get('x-oauth-scopes') ?? undefined,
    };
  }

  /**
   * Create a branch, commit each file onto it, and open a Pull Request back into
   * the base branch. Any GitHub error (other than the 404 file-existence probe)
   * throws with the HTTP status and GitHub's own message — never the token.
   */
  async openPullRequest(input: OpenPrInput): Promise<OpenPrResult> {
    const { owner, repo, branch, title, body, files } = input;

    // 1. Resolve the base branch: the caller's, or the repo's default branch.
    const baseBranch =
      input.baseBranch ?? (await this.getDefaultBranch(owner, repo));

    // 2. Find the commit the base branch currently points at.
    const baseSha = await this.getRefSha(owner, repo, baseBranch);

    // 3. Create the new branch at that commit.
    await this.createBranch(owner, repo, branch, baseSha);

    // 4. Create/update every file on the new branch.
    for (const file of files) {
      await this.commitFile(owner, repo, branch, title, file);
    }

    // 5. Open the PR from the new branch into the base branch.
    const res = await this.request('POST', `/repos/${owner}/${repo}/pulls`, {
      title,
      head: branch,
      base: baseBranch,
      body,
    });
    if (!res.ok) {
      throw await this.githubError(res, 'Failed to open pull request');
    }
    const pr = (await res.json()) as { html_url?: string; number?: number };
    return {
      pullRequestUrl: pr.html_url ?? '',
      branch,
      number: pr.number,
    };
  }

  /** GET the repo and read its default branch. */
  private async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const res = await this.request('GET', `/repos/${owner}/${repo}`);
    if (!res.ok) {
      throw await this.githubError(res, 'Failed to resolve default branch');
    }
    const data = (await res.json()) as { default_branch?: string };
    if (!data.default_branch) {
      throw new Error('Failed to resolve default branch: missing default_branch');
    }
    return data.default_branch;
  }

  /** Resolve the current commit sha a branch points at. */
  private async getRefSha(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string> {
    const res = await this.request(
      'GET',
      `/repos/${owner}/${repo}/git/ref/heads/${encodePath(branch)}`,
    );
    if (!res.ok) {
      throw await this.githubError(res, `Failed to resolve branch "${branch}"`);
    }
    const ref = (await res.json()) as { object?: { sha?: string } };
    const sha = ref.object?.sha;
    if (!sha) {
      throw new Error(`Failed to resolve branch "${branch}": missing sha`);
    }
    return sha;
  }

  /** Create a new branch ref pointing at `baseSha`. */
  private async createBranch(
    owner: string,
    repo: string,
    branch: string,
    baseSha: string,
  ): Promise<void> {
    const res = await this.request('POST', `/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });
    if (!res.ok) {
      throw await this.githubError(res, `Failed to create branch "${branch}"`);
    }
  }

  /**
   * Create or update a single file on `branch`. We probe for an existing file
   * first: a 200 means it already exists and we must pass its blob sha to update
   * it; a 404 means it is a fresh create. Any other status is a real error.
   */
  private async commitFile(
    owner: string,
    repo: string,
    branch: string,
    title: string,
    file: OpenPrFile,
  ): Promise<void> {
    const path = encodePath(file.path);

    let sha: string | undefined;
    const probe = await this.request(
      'GET',
      `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    );
    if (probe.ok) {
      const existing = (await probe.json()) as { sha?: string };
      sha = existing.sha;
    } else if (probe.status !== 404) {
      throw await this.githubError(probe, `Failed to read "${file.path}"`);
    }

    const res = await this.request(
      'PUT',
      `/repos/${owner}/${repo}/contents/${path}`,
      {
        message: `acp: ${title}`,
        content: Buffer.from(file.content, 'utf8').toString('base64'),
        branch,
        ...(sha ? { sha } : {}),
      },
    );
    if (!res.ok) {
      throw await this.githubError(res, `Failed to commit "${file.path}"`);
    }
  }

  /**
   * Issue a request to the GitHub REST API with the standard headers. The token
   * rides only in the `Authorization` header here; `Content-Type` is set only
   * for requests that carry a JSON body.
   */
  private request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'agent-control-plane',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /**
   * Build a sanitized error for a failed response. We surface only the HTTP
   * status and GitHub's own `message` field — never the raw body (which could
   * echo something we sent) and never the token.
   */
  private async githubError(res: Response, context: string): Promise<Error> {
    const message = await extractGitHubMessage(res);
    return new Error(
      `${context} (HTTP ${res.status})` + (message ? `: ${message}` : ''),
    );
  }
}

/**
 * Pull just GitHub's short human-readable `message` out of an error response.
 * Anything else in the body is ignored so we never surface unexpected content.
 */
async function extractGitHubMessage(
  res: Response,
): Promise<string | undefined> {
  try {
    const data = (await res.json()) as { message?: unknown };
    return typeof data?.message === 'string' ? data.message : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Encode a file path (or branch name) for use in a URL path while preserving
 * the `/` separators, so nested paths like `src/app/x.ts` and branches like
 * `acp/run-123` are escaped correctly without collapsing their segments.
 */
function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
