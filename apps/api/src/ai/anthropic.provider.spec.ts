import { AnthropicProvider } from './anthropic.provider';

/**
 * These exercise the real Anthropic adapter against a mocked global fetch, so the
 * request it builds and the response it parses are verified deterministically —
 * without a network call or a real key. A true live call additionally needs a
 * user-supplied key (BYOK), but every line of adapter logic is covered here.
 */
describe('AnthropicProvider', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('builds a correct Messages request and parses text + token usage', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: 'Hello from Claude' }],
        usage: { input_tokens: 42, output_tokens: 7 },
      }),
      text: async () => '',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await new AnthropicProvider('sk-ant-secret').complete({
      system: 'SYS',
      prompt: 'PROMPT',
      model: 'claude-x',
    });

    expect(res).toEqual({
      text: 'Hello from Claude',
      inputTokens: 42,
      outputTokens: 7,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-ant-secret');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(init.headers['content-type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('claude-x');
    expect(body.system).toBe('SYS');
    expect(body.max_tokens).toBe(1024);
    expect(body.messages).toEqual([{ role: 'user', content: 'PROMPT' }]);
  });

  it('defaults missing text/usage to empty string and zero tokens', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    }) as unknown as typeof fetch;

    const res = await new AnthropicProvider('k').complete({
      prompt: 'p',
      model: 'm',
    });
    expect(res).toEqual({ text: '', inputTokens: 0, outputTokens: 0 });
  });

  it('throws with status + provider detail on a non-2xx, never leaking the key', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'authentication_error: invalid x-api-key',
    }) as unknown as typeof fetch;

    let message = '';
    try {
      await new AnthropicProvider('sk-ant-supersecret').complete({
        prompt: 'p',
        model: 'm',
      });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('Anthropic API request failed with status 401');
    expect(message).toContain('invalid x-api-key');
    expect(message).not.toContain('sk-ant-supersecret');
  });
});
