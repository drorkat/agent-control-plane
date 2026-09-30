import {
  AICompletionInput,
  AICompletionResult,
  AIProvider,
} from './provider.interface';

// Marker the RepoContextService writes before each file it includes in the
// prompt. Its presence tells this mock the run wants structured file edits (a
// ChangeProposal), not a free-text plan; its exact text is a shared contract.
const REPO_FILE_MARKER = '### File: ';

/**
 * A network-free provider used for local development and tests (enabled via
 * AI_MOCK=1). Without repository context it returns a short, plausible "plan".
 * When the prompt carries repository context (the {@link REPO_FILE_MARKER}), it
 * instead returns a valid ChangeProposal JSON that appends a small marker line
 * to the first file in that context — enough to exercise the real file-edit
 * loop end to end. Token usage is fake but deterministic.
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock';

  async complete(input: AICompletionInput): Promise<AICompletionResult> {
    const { prompt } = input;

    const text = prompt.includes(REPO_FILE_MARKER)
      ? buildProposalResponse(prompt)
      : buildPlanResponse(prompt);

    // Fake usage: roughly 4 characters per token, as specified.
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(text.length / 4);

    return { text, inputTokens, outputTokens };
  }
}

/** The original behavior: a short numbered plan that references the task. */
function buildPlanResponse(prompt: string): string {
  // Use the first non-empty line of the prompt (typically the task title) so
  // the generated plan clearly references what was asked.
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
 * A structured ChangeProposal (as JSON text) that edits the first file found in
 * the repo context, by appending a small marker line appropriate to its type.
 * If the marker is present but the block cannot be parsed, we fall back to a
 * plan so the mock never throws.
 */
function buildProposalResponse(prompt: string): string {
  const target = firstMarkedFile(prompt);
  if (!target) {
    return buildPlanResponse(prompt);
  }

  const newContent = target.content + trailerFor(target.path);
  return JSON.stringify({
    summary: `Apply the requested change to ${target.path}`,
    files: [{ path: target.path, content: newContent }],
  });
}

/**
 * Extract the first `### File: <path>` entry from the prompt and the content of
 * the fenced code block that follows it. Returns `null` if no complete entry is
 * found. The single trailing newline the context builder adds before the
 * closing fence is stripped, so the content matches the original file.
 */
function firstMarkedFile(
  prompt: string,
): { path: string; content: string } | null {
  const markerIndex = prompt.indexOf(REPO_FILE_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  // The path is the remainder of the marker line.
  const pathStart = markerIndex + REPO_FILE_MARKER.length;
  const lineEnd = prompt.indexOf('\n', pathStart);
  const path = (
    lineEnd === -1 ? prompt.slice(pathStart) : prompt.slice(pathStart, lineEnd)
  ).trim();
  if (!path || lineEnd === -1) {
    return null;
  }

  // The content is the first fenced code block after the marker line.
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
  // Default: append a blank line.
  return '\n';
}
