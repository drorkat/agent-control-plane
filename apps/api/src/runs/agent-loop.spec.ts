import {
  buildAgentLoopSystemPrompt,
  parseAgentAction,
  runAgentLoop,
} from './agent-loop';
import type { AIProvider } from '../ai/provider.interface';
import type { GitHubClient } from '../github/github-client.interface';

/** A provider that replays a fixed script of model responses, one per step. */
function scriptedProvider(responses: string[]): AIProvider {
  let i = 0;
  return {
    name: 'scripted',
    complete: async () => ({
      text: responses[Math.min(i++, responses.length - 1)],
      inputTokens: 1,
      outputTokens: 1,
    }),
  };
}

/** A GitHub client stub whose getFile is a spy returning fixed content. */
function stubClient(getFile: jest.Mock): GitHubClient {
  return {
    verifyToken: async () => ({ login: 'x' }),
    openPullRequest: async () => ({ pullRequestUrl: 'u', branch: 'b' }),
    listFiles: async () => [],
    getFile,
  } as unknown as GitHubClient;
}

const baseOpts = {
  owner: 'o',
  repo: 'r',
  model: 'm',
  system: 'sys',
  taskText: 'task',
  contextSection: 'ctx',
  allPaths: ['src/a.ts'],
  seedFiles: new Map<string, string>(),
};

describe('parseAgentAction', () => {
  it('parses a list_files action', () => {
    expect(parseAgentAction('{"tool":"list_files"}')).toEqual({
      tool: 'list_files',
    });
  });

  it('parses a read_file action with its path', () => {
    expect(parseAgentAction('{"tool":"read_file","path":"src/a.ts"}')).toEqual({
      tool: 'read_file',
      path: 'src/a.ts',
    });
  });

  it('trims whitespace around a read_file path', () => {
    expect(
      parseAgentAction('{"tool":"read_file","path":"  src/a.ts  "}'),
    ).toEqual({ tool: 'read_file', path: 'src/a.ts' });
  });

  it('parses a propose_changes action with files', () => {
    const input = JSON.stringify({
      tool: 'propose_changes',
      summary: 'Implement the fix',
      files: [{ path: 'src/a.ts', content: 'const a = 1;' }],
    });
    expect(parseAgentAction(input)).toEqual({
      tool: 'propose_changes',
      summary: 'Implement the fix',
      files: [{ path: 'src/a.ts', content: 'const a = 1;' }],
    });
  });

  it('tolerates prose surrounding the JSON action', () => {
    expect(
      parseAgentAction('Sure, my action is: {"tool":"list_files"} — thanks!'),
    ).toEqual({ tool: 'list_files' });
  });

  it.each([
    ['a read_file missing its path', '{"tool":"read_file"}'],
    ['a read_file with a blank path', '{"tool":"read_file","path":"   "}'],
    ['an unknown tool', '{"tool":"delete_everything"}'],
    ['a missing tool key', '{"foo":"bar"}'],
    ['a propose_changes with no valid files', '{"tool":"propose_changes","summary":"s","files":[]}'],
    ['non-JSON text', 'I am not sure what to do next.'],
    ['a bare JSON array (no object)', '[1, 2, 3]'],
  ])('returns null for %s', (_label, input) => {
    expect(parseAgentAction(input)).toBeNull();
  });
});

describe('runAgentLoop gateway enforcement', () => {
  it('executes a read when the gateway auto-allows read_repo, and records the policy', async () => {
    const getFile = jest.fn().mockResolvedValue({
      path: 'src/a.ts',
      content: 'const a = 1;',
      sha: 'sha',
    });
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const result = await runAgentLoop({
      ...baseOpts,
      provider: scriptedProvider([
        '{"tool":"read_file","path":"src/a.ts"}',
        '{"tool":"propose_changes","summary":"s","files":[{"path":"src/a.ts","content":"const a = 2;"}]}',
      ]),
      client: stubClient(getFile),
      onEvent: async (type, payload) => {
        events.push({ type, payload });
      },
      gate: () => ({ decision: 'auto', risk: 'low' }),
    });

    expect(getFile).toHaveBeenCalledTimes(1);
    expect(result.readFiles.get('src/a.ts')).toBe('const a = 1;');
    const req = events.find(
      (e) => e.type === 'TOOL_REQUESTED' && e.payload.tool === 'read_file',
    );
    expect(req?.payload.policy).toBe('auto');
    expect(events.some((e) => e.type === 'TOOL_BLOCKED')).toBe(false);
  });

  it('blocks a read (never touches the repo) when the gateway blocks read_repo', async () => {
    const getFile = jest.fn();
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    await runAgentLoop({
      ...baseOpts,
      provider: scriptedProvider([
        '{"tool":"read_file","path":"src/a.ts"}',
        '{"tool":"propose_changes","summary":"s","files":[{"path":"src/a.ts","content":"x"}]}',
      ]),
      client: stubClient(getFile),
      onEvent: async (type, payload) => {
        events.push({ type, payload });
      },
      gate: () => ({ decision: 'blocked', risk: 'critical' }),
    });

    expect(getFile).not.toHaveBeenCalled();
    expect(
      events.some(
        (e) => e.type === 'TOOL_BLOCKED' && e.payload.tool === 'read_file',
      ),
    ).toBe(true);
  });
});

describe('buildAgentLoopSystemPrompt', () => {
  it('includes the base instructions and the propose_changes tool', () => {
    const prompt = buildAgentLoopSystemPrompt('BASE_MARKER');
    expect(prompt).toContain('BASE_MARKER');
    expect(prompt).toContain('propose_changes');
    // The mock provider detects loop mode by this exact word; also surface the
    // other two tools so the protocol stays fully described.
    expect(prompt).toContain('list_files');
    expect(prompt).toContain('read_file');
  });
});
