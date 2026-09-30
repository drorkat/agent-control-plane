// A bounded, tool-using agent loop (a small ReAct loop). The model works in
// steps: each turn it returns ONE JSON action — list the repo's files, read a
// file, or propose the final changes. The loop executes read/list against the
// connected repository, feeds the result back into the next prompt, and stops
// when the model proposes changes or the step budget is spent.
//
// This is what makes the agent "multi-step": rather than one shot, it can pull
// in the exact files it needs before committing to an edit. Every file it reads
// is also captured (path -> original content) so the run can show a real
// before/after diff of the proposed changes.

import { AIProvider } from '../ai/provider.interface';
import { GitHubClient } from '../github/github-client.interface';
import {
  ChangeProposal,
  ProposedFile,
  extractJsonObject,
  parseChangeProposal,
} from './change-proposal';

/** One action the model can take on a step. */
export type AgentAction =
  | { tool: 'list_files' }
  | { tool: 'read_file'; path: string }
  | { tool: 'propose_changes'; summary: string; files: ProposedFile[] };

/** A recorded step of the loop, for the run's event log. */
export interface AgentStep {
  index: number;
  tool: 'list_files' | 'read_file' | 'propose_changes';
  path?: string;
  resultSummary: string;
}

export interface AgentLoopResult {
  /** The final change proposal, or null if the agent never produced one. */
  proposal: ChangeProposal | null;
  /** Original content of every file the agent saw (path -> content), for diffs. */
  readFiles: Map<string, string>;
  steps: AgentStep[];
  inputTokens: number;
  outputTokens: number;
  /** The last model text (used for the MODEL_RESPONSE event / fallback). */
  finalText: string;
}

/** Hard caps so a run can never loop forever or read the whole repo. */
const MAX_STEPS = 6;
const MAX_READS = 5;
const MAX_FILE_CONTENT = 20_000;

/**
 * Append the tool-loop protocol to an agent's base instructions. The model is
 * told to reply, each step, with ONE JSON action object. The presence of the
 * word `propose_changes` in the system prompt is also how the mock provider
 * detects loop mode — keep it.
 */
export function buildAgentLoopSystemPrompt(base: string): string {
  return [
    base,
    '',
    '## How you work',
    'You work in steps. On each step, reply with ONLY one JSON object — an action:',
    '  {"tool":"list_files"}                        — list the repository file paths',
    '  {"tool":"read_file","path":"<path>"}         — read one file\'s contents',
    '  {"tool":"propose_changes","summary":"<why>","files":[{"path":"<path>","content":"<full new file content>"}]}',
    'Use list_files / read_file to gather what you need, then finish with',
    'propose_changes. Each file `content` MUST be the FULL new content of that',
    'file — never a diff or a fragment. Keep the change minimal and focused on the',
    'task. Output no prose — only the single JSON action object for this step.',
  ].join('\n');
}

/**
 * Parse a model response into an {@link AgentAction}, or null when it is not a
 * usable action. Tolerates fenced / prose-wrapped JSON (see extractJsonObject).
 */
export function parseAgentAction(text: string): AgentAction | null {
  const obj = extractJsonObject(text);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return null;
  }
  const tool = (obj as { tool?: unknown }).tool;

  if (tool === 'list_files') {
    return { tool: 'list_files' };
  }
  if (tool === 'read_file') {
    const path = (obj as { path?: unknown }).path;
    if (typeof path === 'string' && path.trim()) {
      return { tool: 'read_file', path: path.trim() };
    }
    return null;
  }
  if (tool === 'propose_changes') {
    // The action JSON carries {summary, files} at the top level, so the existing
    // proposal parser/validator handles it directly (it ignores the `tool` key).
    const proposal = parseChangeProposal(text);
    if (proposal) {
      return { tool: 'propose_changes', summary: proposal.summary, files: proposal.files };
    }
    return null;
  }
  return null;
}

export interface RunAgentLoopOptions {
  provider: AIProvider;
  client: GitHubClient;
  owner: string;
  repo: string;
  model: string;
  /** The loop system prompt (from {@link buildAgentLoopSystemPrompt}). */
  system: string;
  taskText: string;
  /** The repo-context prompt section (file listing + seed file contents). */
  contextSection: string;
  /** All (capped) repo file paths, returned by a list_files action. */
  allPaths: string[];
  /** Files already read as seed context (path -> content). */
  seedFiles: Map<string, string>;
  /** Called for each TOOL_REQUESTED / TOOL_RESULT step so the run can log it. */
  onEvent?: (type: string, payload: Record<string, unknown>) => Promise<void>;
}

/**
 * Drive the agent loop to completion (a proposal) or the step budget. Reads and
 * lists are executed against the connected repo; the model's own text is never
 * trusted to have run them. Resolves with the proposal (or null), the map of
 * files seen (for diffs), the recorded steps, and summed token usage.
 */
export async function runAgentLoop(
  opts: RunAgentLoopOptions,
): Promise<AgentLoopResult> {
  const readFiles = new Map<string, string>(opts.seedFiles);
  const progress: string[] = [];
  const steps: AgentStep[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let finalText = '';
  let proposal: ChangeProposal | null = null;
  let reads = 0;

  for (let i = 0; i < MAX_STEPS; i += 1) {
    const prompt = buildStepPrompt(opts.taskText, opts.contextSection, progress);
    const res = await opts.provider.complete({
      system: opts.system,
      prompt,
      model: opts.model,
    });
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;
    finalText = res.text;

    const action = parseAgentAction(res.text);
    if (!action) {
      break;
    }

    if (action.tool === 'propose_changes') {
      await opts.onEvent?.('TOOL_REQUESTED', {
        tool: 'propose_changes',
        fileCount: action.files.length,
      });
      proposal = { summary: action.summary, files: action.files };
      steps.push({
        index: steps.length + 1,
        tool: 'propose_changes',
        resultSummary: `${action.files.length} file(s)`,
      });
      await opts.onEvent?.('TOOL_RESULT', {
        tool: 'propose_changes',
        fileCount: action.files.length,
      });
      break;
    }

    if (action.tool === 'list_files') {
      await opts.onEvent?.('TOOL_REQUESTED', { tool: 'list_files' });
      const count = opts.allPaths.length;
      progress.push(`${progress.length + 1}. list_files → ${count} files`);
      steps.push({
        index: steps.length + 1,
        tool: 'list_files',
        resultSummary: `${count} files`,
      });
      await opts.onEvent?.('TOOL_RESULT', { tool: 'list_files', count });
      continue;
    }

    // read_file
    await opts.onEvent?.('TOOL_REQUESTED', {
      tool: 'read_file',
      path: action.path,
    });
    let content: string | null = readFiles.get(action.path) ?? null;
    if (content === null && reads < MAX_READS) {
      try {
        const file = await opts.client.getFile(opts.owner, opts.repo, action.path);
        content = file ? file.content : null;
      } catch {
        content = null;
      }
      reads += 1;
    }
    if (content !== null) {
      const stored =
        content.length > MAX_FILE_CONTENT
          ? content.slice(0, MAX_FILE_CONTENT) + '\n... [truncated]'
          : content;
      readFiles.set(action.path, stored);
      progress.push(
        `${progress.length + 1}. read_file ${action.path} →\n\`\`\`\n${stored}\n\`\`\``,
      );
      steps.push({
        index: steps.length + 1,
        tool: 'read_file',
        path: action.path,
        resultSummary: `${stored.length} chars`,
      });
      await opts.onEvent?.('TOOL_RESULT', {
        tool: 'read_file',
        path: action.path,
        chars: stored.length,
      });
    } else {
      progress.push(`${progress.length + 1}. read_file ${action.path} → not found`);
      steps.push({
        index: steps.length + 1,
        tool: 'read_file',
        path: action.path,
        resultSummary: 'not found',
      });
      await opts.onEvent?.('TOOL_RESULT', {
        tool: 'read_file',
        path: action.path,
        found: false,
      });
    }
  }

  return { proposal, readFiles, steps, inputTokens, outputTokens, finalText };
}

/** Build the per-step prompt: task, repo context, progress so far, next action. */
function buildStepPrompt(
  taskText: string,
  contextSection: string,
  progress: string[],
): string {
  const lines = [taskText, '', contextSection, '', '## Progress so far'];
  if (progress.length === 0) {
    lines.push('(nothing yet)');
  } else {
    lines.push(...progress);
  }
  lines.push('', '## Your next action', 'Reply with ONE JSON action object.');
  return lines.join('\n');
}
