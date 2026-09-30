// Parses the structured file edits a model returns for a run. Instead of a free
// text "plan", the agent is asked to reply with a JSON object describing the
// full new content of each file it wants to change; this module turns that
// (often fence-wrapped or prose-surrounded) reply into a validated, bounded
// ChangeProposal the run engine can commit as a real pull request.

/** One file the model wants to create or overwrite, with its FULL new content. */
export interface ProposedFile {
  path: string;
  content: string;
}

/** A validated set of file edits plus a short human summary of the change. */
export interface ChangeProposal {
  summary: string;
  files: ProposedFile[];
}

/** Never commit more than this many files from a single proposal. */
export const MAX_PROPOSAL_FILES = 10;

/** Skip any single file whose content is larger than this many characters. */
const MAX_FILE_CONTENT_LENGTH = 100_000;

/**
 * Parse a model response into a ChangeProposal, or return `null` when it does
 * not contain a usable one. The response may be a bare JSON object, wrapped in
 * ```json fences, or surrounded by prose. Invalid file entries are dropped; the
 * result is capped defensively (see the constants above). `null` means the run
 * engine should treat the response as producing no committable change.
 */
export function parseChangeProposal(text: string): ChangeProposal | null {
  if (!text) {
    return null;
  }

  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as { summary?: unknown; files?: unknown };
  if (typeof obj.summary !== 'string' || !Array.isArray(obj.files)) {
    return null;
  }

  const files: ProposedFile[] = [];
  for (const entry of obj.files) {
    if (files.length >= MAX_PROPOSAL_FILES) {
      break;
    }
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const candidate = entry as { path?: unknown; content?: unknown };
    if (
      typeof candidate.path !== 'string' ||
      typeof candidate.content !== 'string'
    ) {
      continue;
    }
    const path = candidate.path.trim();
    if (!path) {
      continue;
    }
    // Guard against a single pathological file blowing up the commit.
    if (candidate.content.length > MAX_FILE_CONTENT_LENGTH) {
      continue;
    }
    files.push({ path, content: candidate.content });
  }

  if (files.length === 0) {
    return null;
  }

  return { summary: obj.summary, files };
}

/**
 * Append the structured-output contract to an agent's base instructions. The
 * model is told to return ONLY the JSON object {@link parseChangeProposal}
 * expects, with each file's FULL new content (never a diff), and to keep the
 * change minimal and focused on the task.
 */
export function buildAgentSystemPrompt(baseInstructions: string): string {
  return [
    baseInstructions,
    '',
    '## Response format',
    'Reply with ONLY a single JSON object of exactly this shape:',
    '{"summary": string, "files": [{"path": string, "content": string}]}',
    'Each `content` MUST be the FULL new content of that file — never a diff, a',
    'patch, or a fragment. Keep the change minimal and focused strictly on the',
    'task. Do not include any prose, explanation, or Markdown outside the JSON',
    'object.',
  ].join('\n');
}

/**
 * Pull a single JSON object out of a model response that may be wrapped in a
 * ```json fence or surrounded by prose. An enclosing fence is stripped only at
 * the string boundaries, so back-ticks inside a file's content are preserved;
 * we then take the substring from the first `{` to the last `}` and parse it.
 * Returns the parsed value, or `null` when nothing parses.
 */
function extractJsonObject(text: string): unknown {
  let cleaned = text.trim();

  // If the whole reply is a single fenced block, unwrap it. The lazy body plus
  // the end anchor means only the final closing fence is matched, so back-ticks
  // inside the JSON (e.g. a Markdown file's content) are left intact.
  const fenced = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fenced) {
    cleaned = fenced[1].trim();
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end < start) {
    return null;
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}
