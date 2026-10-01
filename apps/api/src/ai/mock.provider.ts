import {
  AICompletionInput,
  AICompletionResult,
  AIProvider,
} from './provider.interface';

// Marker the RepoContextService writes before each file it includes in the
// prompt. The mock parses it to find a file to edit / read.
const REPO_FILE_MARKER = '### File: ';

/**
 * A network-free provider used for local development and tests (enabled via
 * AI_MOCK=1).
 *
 * Three behaviors, chosen from the prompt:
 *  - No repo context → a short, plausible free-text "plan".
 *  - Agent loop mode (the loop system prompt mentions `propose_changes`) → ONE
 *    JSON action per step, walking list_files → read_file → propose_changes so
 *    the multi-step loop is exercised end to end.
 *  - Agent loop mode with a `[[action:<name>]]` marker in the task → a single
 *    request_action step for that governed action, so the Tool Gateway's
 *    blocked / high-risk tiers can be driven deterministically.
 * Token usage is fake but deterministic.
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock';

  async complete(input: AICompletionInput): Promise<AICompletionResult> {
    const loopMode = (input.system ?? '').includes('propose_changes');
    const text = loopMode
      ? buildLoopAction(input.prompt)
      : buildPlanResponse(input.prompt);

    // Fake usage: roughly 4 characters per token.
    const inputTokens = Math.ceil((input.prompt.length + (input.system?.length ?? 0)) / 4);
    const outputTokens = Math.ceil(text.length / 4);

    return { text, inputTokens, outputTokens };
  }
}

/** The context-free behavior: a short numbered plan that references the task. */
function buildPlanResponse(prompt: string): string {
  const topic =
    prompt
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? 'the task';

  return [
    `Plan for: ${topic}`,
    '',
    '1. Clarify the requirements and acceptance criteria.',
    '2. Explore the relevant parts of the codebase.',
    '3. Implement the change in small, reviewable steps.',
    '4. Add or update tests and run the suite.',
    '5. Summarize the work and open a pull request for review.',
  ].join('\n');
}

/**
 * The agent-loop behavior: return ONE JSON action for the current step. The
 * step number is read from the prompt's "## Progress so far" section, so the
 * mock walks a deterministic sequence: list_files → read_file → propose_changes.
 */
function buildLoopAction(prompt: string): string {
  // A task can explicitly drive a governed action with a `[[action:<name>]]`
  // marker (e.g. `[[action:delete_data]]`). Emit it as the very first action so
  // the run engine routes it straight through the Tool Gateway — this is how
  // the blocked / approval-high tiers are exercised deterministically.
  const requested = requestedActionMarker(prompt);
  if (requested) {
    return JSON.stringify({ tool: 'request_action', action: requested });
  }

  const done = countProgressSteps(prompt);

  // Step 1: survey the repository.
  if (done <= 0) {
    return JSON.stringify({ tool: 'list_files' });
  }

  // Step 2: read one source file (demonstrates pulling in a file on demand).
  if (done === 1) {
    const path = pickReadPath(prompt);
    if (path) {
      return JSON.stringify({ tool: 'read_file', path });
    }
  }

  // Final step: propose a real multi-file change — edit the first context file
  // (a modification, so the run shows a diff) AND create a new file (shown with
  // a "New file" badge). This exercises the multi-file diff end to end.
  const target = firstMarkedFile(prompt);
  const files: { path: string; content: string }[] = [];
  if (target) {
    files.push({ path: target.path, content: target.content + trailerFor(target.path) });
  }
  files.push({
    path: 'docs/agent-notes.md',
    content:
      '# Agent notes\n\nThis file was created by an Agent Control Plane agent (mock)\n' +
      'to demonstrate real multi-file edits.\n',
  });
  return JSON.stringify({
    tool: 'propose_changes',
    summary: target
      ? `Update ${target.path} and add docs/agent-notes.md`
      : 'Add docs/agent-notes.md',
    files,
  });
}

/**
 * Detect a governed-action marker in the prompt: `[[action:<name>]]`. A task can
 * embed e.g. `[[action:delete_data]]` or `[[action:merge_pull_request]]` to make
 * the mock request that governed action instead of proposing edits, so the
 * gateway's blocked / high-risk tiers can be exercised deterministically in dev
 * and tests. The name is lower-cased and limited to the policy-key charset.
 */
function requestedActionMarker(prompt: string): string | null {
  const m = prompt.match(/\[\[action:([a-z_]+)\]\]/i);
  return m ? m[1].toLowerCase() : null;
}

/** Count the numbered step lines in the prompt's "## Progress so far" section. */
function countProgressSteps(prompt: string): number {
  const start = prompt.indexOf('## Progress so far');
  if (start === -1) {
    return 0;
  }
  let section = prompt.slice(start);
  const end = section.indexOf('## Your next action');
  if (end !== -1) {
    section = section.slice(0, end);
  }
  const matches = section.match(/^\s*\d+\.\s/gm);
  return matches ? matches.length : 0;
}

/** Pick a file path to read from the prompt's "Files:" listing (prefer nested). */
function pickReadPath(prompt: string): string | null {
  const filesIdx = prompt.indexOf('\nFiles:');
  const region = filesIdx === -1 ? prompt : prompt.slice(filesIdx + 1);
  const entries: string[] = [];
  for (const line of region.split('\n')) {
    if (line.startsWith('### File:') || line.startsWith('## ')) {
      break; // reached the file blocks / next section — stop scanning the list
    }
    const m = line.match(/^-\s+(.+)$/);
    if (m) {
      entries.push(m[1].trim());
    }
  }
  if (entries.length === 0) {
    return null;
  }
  return entries.find((p) => p.includes('/')) ?? entries[0];
}

/**
 * Extract the first `### File: <path>` entry from the prompt and the content of
 * the fenced code block that follows it. Returns null if none is found.
 */
function firstMarkedFile(
  prompt: string,
): { path: string; content: string } | null {
  const markerIndex = prompt.indexOf(REPO_FILE_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  const pathStart = markerIndex + REPO_FILE_MARKER.length;
  const lineEnd = prompt.indexOf('\n', pathStart);
  const path = (
    lineEnd === -1 ? prompt.slice(pathStart) : prompt.slice(pathStart, lineEnd)
  ).trim();
  if (!path || lineEnd === -1) {
    return null;
  }

  const fenceOpen = prompt.indexOf('```', lineEnd + 1);
  if (fenceOpen === -1) {
    return null;
  }
  const contentStart = prompt.indexOf('\n', fenceOpen);
  if (contentStart === -1) {
    return null;
  }
  const fenceClose = prompt.indexOf('```', contentStart + 1);
  const raw =
    fenceClose === -1
      ? prompt.slice(contentStart + 1)
      : prompt.slice(contentStart + 1, fenceClose);

  return { path, content: stripTrailingNewline(raw) };
}

/** Drop a single trailing newline (the fence separator the builder inserts). */
function stripTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value.slice(0, -1) : value;
}

const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java|kt|kts|c|h|cc|cpp|hpp|cs|php|swift|scala|sh|css|scss|less|sql|vue|svelte)$/i;

/** The trailing line appended for a given file type. */
function trailerFor(path: string): string {
  if (/\.mdx?$/i.test(path)) {
    return '\n<!-- Updated by an Agent Control Plane agent (mock) -->\n';
  }
  if (CODE_EXT.test(path)) {
    return '\n// Updated by an Agent Control Plane agent (mock)\n';
  }
  return '\n';
}
