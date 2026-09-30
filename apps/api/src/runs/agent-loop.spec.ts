import { buildAgentLoopSystemPrompt, parseAgentAction } from './agent-loop';

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
