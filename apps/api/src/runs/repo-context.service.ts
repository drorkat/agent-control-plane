import { Injectable, Logger } from '@nestjs/common';
import { GitHubClientFactory } from '../github/github-client.factory';
import { RepoFileRef } from '../github/github-client.interface';

/** One repository file read into the run's prompt context. */
export interface RepoContextFile {
  path: string;
  content: string;
}

/**
 * The connected repo's code, gathered as context for a run: a handful of read
 * files, the (capped) list of all file paths, and a ready-to-inject prompt
 * section built from both.
 */
export interface RepoContext {
  files: RepoContextFile[];
  allPaths: string[];
  promptSection: string;
}

/** Cap the file listing we put in the prompt so it stays a reasonable size. */
const MAX_LISTED_PATHS = 200;

/** Read at most this many files as detailed context for the model. */
const MAX_CONTEXT_FILES = 5;

/** Truncate any single file we read to this many characters. */
const MAX_FILE_CONTENT = 20_000;

/**
 * Gathers repository code as context for a run. It lists the connected repo's
 * files, picks a small, relevant subset to read, and builds a prompt section the
 * run engine prepends to the task. Every failure mode — no GitHub connection, a
 * GitHub/network error — resolves to `null` so the caller can fall back to
 * context-free planning; gathering context never throws.
 */
@Injectable()
export class RepoContextService {
  private readonly logger = new Logger(RepoContextService.name);

  constructor(private readonly github: GitHubClientFactory) {}

  /**
   * Gather context for `owner/repo`, biased toward files relevant to `taskText`.
   * Returns `null` when GitHub is not connected or any error occurs while
   * reading the repo.
   */
  async gather(
    owner: string,
    repo: string,
    taskText: string,
  ): Promise<RepoContext | null> {
    try {
      const client = await this.github.forCurrentOrg();
      if (!client) {
        return null;
      }

      const tree = await client.listFiles(owner, repo);
      const filePaths = tree
        .filter((entry) => entry.type === 'file')
        .map((entry) => entry.path);
      const allPaths = filePaths.slice(0, MAX_LISTED_PATHS);

      const chosen = selectRelevantFiles(filePaths, taskText, MAX_CONTEXT_FILES);

      const files: RepoContextFile[] = [];
      for (const path of chosen) {
        const file = await client.getFile(owner, repo, path);
        if (!file) {
          continue;
        }
        let content = file.content;
        if (content.length > MAX_FILE_CONTENT) {
          content = content.slice(0, MAX_FILE_CONTENT) + '\n... [truncated]';
        }
        files.push({ path, content });
      }

      return {
        files,
        allPaths,
        promptSection: buildPromptSection(allPaths, files),
      };
    } catch (err) {
      // Any GitHub/network failure: fall back to context-free planning. A
      // context-gathering error must never surface to the run — but it must not
      // vanish silently either (an operator seeing "plan only" on a repo-linked
      // task needs a breadcrumb), so log the reason. No token material is ever in
      // these messages.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to gather repo context for ${owner}/${repo}; ` +
          `falling back to context-free planning: ${message}`,
      );
      return null;
    }
  }
}

/**
 * Pick up to `limit` files worth reading in full: a README first (if any), then
 * files whose path shares a word with the task, then the shortest-path source
 * files. Obvious noise (lockfiles, vendored code, build output, binaries) is
 * excluded throughout.
 */
function selectRelevantFiles(
  paths: string[],
  taskText: string,
  limit: number,
): string[] {
  const candidates = paths.filter((path) => !isNoise(path));
  const chosen: string[] = [];
  const add = (path: string): void => {
    if (path && chosen.length < limit && !chosen.includes(path)) {
      chosen.push(path);
    }
  };

  // 1. Always include a README if present (prefer the shallowest one).
  const readme = candidates
    .filter((path) => /(^|\/)readme(\.[^/]*)?$/i.test(path))
    .sort((a, b) => a.length - b.length)[0];
  if (readme) {
    add(readme);
  }

  // 2. Files whose path shares a word (>= 3 chars) with the task, best first.
  const words = taskWords(taskText);
  if (words.length > 0) {
    const scored = candidates
      .map((path) => ({ path, score: relevanceScore(path, words) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.path.length - b.path.length);
    for (const entry of scored) {
      add(entry.path);
    }
  }

  // 3. Fill any remaining slots with the shortest-path source files.
  const sources = candidates
    .filter((path) => isSource(path))
    .sort(
      (a, b) =>
        pathDepth(a) - pathDepth(b) || a.length - b.length || a.localeCompare(b),
    );
  for (const path of sources) {
    add(path);
  }

  return chosen;
}

/** Distinct lowercased task words of length >= 3, used for relevance matching. */
function taskWords(taskText: string): string[] {
  const words = new Set<string>();
  for (const word of taskText.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 3) {
      words.add(word);
    }
  }
  return [...words];
}

/** Score a path by how many task words it shares (whole-token matches weigh more). */
function relevanceScore(path: string, words: string[]): number {
  const lower = path.toLowerCase();
  const tokens = new Set(
    lower.split(/[^a-z0-9]+/).filter((token) => token.length >= 3),
  );
  let score = 0;
  for (const word of words) {
    if (tokens.has(word)) {
      score += 2;
    } else if (lower.includes(word)) {
      score += 1;
    }
  }
  return score;
}

const NOISE_DIRS = ['node_modules/', 'dist/', 'build/', 'vendor/', '.min.'];
const NOISE_EXT =
  /\.(png|jpe?g|gif|svg|ico|webp|bmp|pdf|zip|gz|tar|tgz|woff2?|ttf|eot|otf|mp4|mov|webm|mp3|wav|lock)$/i;
const LOCKFILES =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock)$/i;

/** True for files not worth reading as context: vendored, built, binary, locks. */
function isNoise(path: string): boolean {
  const lower = path.toLowerCase();
  if (NOISE_DIRS.some((needle) => lower.includes(needle))) {
    return true;
  }
  return NOISE_EXT.test(path) || LOCKFILES.test(path);
}

const SOURCE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java|kt|kts|c|h|cc|cpp|hpp|cs|php|swift|scala|sh|sql|css|scss|less|html|vue|svelte|json|ya?ml|toml|md|mdx)$/i;

/** True for source/config/doc files we are willing to read as context. */
function isSource(path: string): boolean {
  return SOURCE_EXT.test(path);
}

/** Number of path segments, used to prefer shallower (root/near-root) files. */
function pathDepth(path: string): number {
  return path.split('/').length;
}

/**
 * Build the "## Repository context" prompt block: the (capped) file listing,
 * then each read file under a `### File: <path>` marker followed by its content
 * in a fenced code block. The exact `### File: <path>` marker is a contract the
 * mock AI provider parses, so it must not change.
 */
function buildPromptSection(
  allPaths: string[],
  files: RepoContextFile[],
): string {
  const lines: string[] = ['## Repository context', '', 'Files:'];
  for (const path of allPaths) {
    lines.push(`- ${path}`);
  }
  for (const file of files) {
    lines.push('', `### File: ${file.path}`, '```', file.content, '```');
  }
  return lines.join('\n');
}
