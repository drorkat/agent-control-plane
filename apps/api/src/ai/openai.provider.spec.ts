import { OpenAIProvider } from './openai.provider';

/**
 * Exercises the real OpenAI adapter against a mocked global fetch: the chat
 * request it builds and the response it parses are verified deterministically,
 * without a network call or a real key. A true live call additionally needs a
 * user-supplied key (BYOK); the adapter logic itself is fully covered here.
 */
describe('OpenAIProvider', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('builds a correct Chat Completions request and parses text + token usage', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Hello from GPT' } }],
        usage: { prompt_tokens: 30, completion_tokens: 5 },
      }),
      text: async () => '',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await new OpenAIProvider('sk-openai-secret').complete({
      system: 'SYS',
      prompt: 'PROMPT',
      model: 'gpt-x',
    });

    expect(res).toEqual({
      text: 'Hello from GPT',
      inputTokens: 30,
      outputTokens: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-openai-secret');
    expect(init.headers['content-type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-x');
    expect(body.messages).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'PROMPT' },
    ]);
  });

  it('sends an empty system string when none is provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await new OpenAIProvider('k').complete({
      prompt: 'p',
      model: 'm',
    });
    expect(res).toEqual({ text: '', inputTokens: 0, outputTokens: 0 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: 'system', content: '' });
  });

  it('throws with status + provider detail on a non-2xx, never leaking the key', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => 'rate_limit_exceeded',
    }) as unknown as typeof fetch;

    let message = '';
    try {
      await new OpenAIProvider('sk-openai-supersecret').complete({
        prompt: 'p',
        model: 'm',
      });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('OpenAI API request failed with status 429');
    expect(message).toContain('rate_limit_exceeded');
    expect(message).not.toContain('sk-openai-supersecret');
  });
});
