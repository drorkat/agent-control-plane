import {
  MAX_PROPOSAL_FILES,
  buildAgentSystemPrompt,
  extractJsonObject,
  parseChangeProposal,
} from './change-proposal';

describe('parseChangeProposal', () => {
  it('parses a bare JSON object', () => {
    const input = JSON.stringify({
      summary: 'Add a greeting',
      files: [{ path: 'src/hello.ts', content: 'export const hi = 1;' }],
    });
    const result = parseChangeProposal(input);
    expect(result?.summary).toBe('Add a greeting');
    expect(result?.files).toEqual([
      { path: 'src/hello.ts', content: 'export const hi = 1;' },
    ]);
  });

  it('parses a ```json fenced object', () => {
    const payload = {
      summary: 'Fenced change',
      files: [{ path: 'a.ts', content: 'const a = 1;' }],
    };
    const fenced = '```json\n' + JSON.stringify(payload) + '\n```';
    const result = parseChangeProposal(fenced);
    expect(result?.summary).toBe('Fenced change');
    expect(result?.files).toHaveLength(1);
  });

  it('preserves back-ticks inside a fenced file content', () => {
    const payload = {
      summary: 'Docs',
      files: [{ path: 'README.md', content: '```ts\nconst x = 1;\n```' }],
    };
    const fenced = '```json\n' + JSON.stringify(payload) + '\n```';
    const result = parseChangeProposal(fenced);
    expect(result?.files[0].content).toBe('```ts\nconst x = 1;\n```');
  });

  it('parses JSON surrounded by prose', () => {
    const json = JSON.stringify({
      summary: 'Prose-wrapped',
      files: [{ path: 'x.ts', content: 'x' }],
    });
    const input = `Sure! Here is my proposal:\n${json}\nLet me know if that works.`;
    const result = parseChangeProposal(input);
    expect(result?.summary).toBe('Prose-wrapped');
    expect(result?.files).toHaveLength(1);
  });

  it('drops invalid file entries but keeps valid ones', () => {
    const input = JSON.stringify({
      summary: 'Mixed',
      files: [
        { path: 'good.ts', content: 'ok' },
        { path: 123, content: 'bad path type' },
        { content: 'missing path' },
        { path: 'no-content' },
        { path: '   ', content: 'blank path' },
        null,
        'not-an-object',
      ],
    });
    const result = parseChangeProposal(input);
    expect(result?.files).toEqual([{ path: 'good.ts', content: 'ok' }]);
  });

  it('trims whitespace around file paths', () => {
    const input = JSON.stringify({
      summary: 's',
      files: [{ path: '  src/a.ts  ', content: 'x' }],
    });
    const result = parseChangeProposal(input);
    expect(result?.files[0].path).toBe('src/a.ts');
  });

  it('caps the result at MAX_PROPOSAL_FILES', () => {
    const files = Array.from({ length: MAX_PROPOSAL_FILES + 5 }, (_, i) => ({
      path: `file-${i}.ts`,
      content: `content ${i}`,
    }));
    const result = parseChangeProposal(JSON.stringify({ summary: 's', files }));
    expect(result?.files).toHaveLength(MAX_PROPOSAL_FILES);
  });

  it('skips a file whose content exceeds the size cap', () => {
    const huge = 'x'.repeat(100_001);
    const input = JSON.stringify({
      summary: 's',
      files: [
        { path: 'small.ts', content: 'ok' },
        { path: 'huge.ts', content: huge },
      ],
    });
    const result = parseChangeProposal(input);
    expect(result?.files).toEqual([{ path: 'small.ts', content: 'ok' }]);
  });

  it('returns null when every file is invalid or dropped', () => {
    const input = JSON.stringify({
      summary: 's',
      files: [{ path: '', content: 'x' }],
    });
    expect(parseChangeProposal(input)).toBeNull();
  });

  it.each([
    ['empty string', ''],
    ['the literal null', 'null'],
    ['non-JSON prose', 'I could not complete this task.'],
    ['a JSON array', '[1, 2, 3]'],
    ['missing files array', '{"summary":"s"}'],
    ['non-string summary', '{"summary":123,"files":[]}'],
  ])('returns null for %s', (_label, input) => {
    expect(parseChangeProposal(input)).toBeNull();
  });
});

describe('extractJsonObject', () => {
  it('extracts a bare object', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('extracts an object embedded in prose', () => {
    expect(extractJsonObject('blah {"a":1} blah')).toEqual({ a: 1 });
  });

  it('returns null when there is no object', () => {
    expect(extractJsonObject('no json here')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(extractJsonObject('{ not: valid json }')).toBeNull();
  });
});

describe('buildAgentSystemPrompt', () => {
  it('includes the base instructions and describes the JSON shape', () => {
    const prompt = buildAgentSystemPrompt('BASE_INSTRUCTIONS_MARKER');
    expect(prompt).toContain('BASE_INSTRUCTIONS_MARKER');
    expect(prompt).toContain('summary');
    expect(prompt).toContain('files');
    expect(prompt).toContain('path');
    expect(prompt).toContain('content');
  });
});
