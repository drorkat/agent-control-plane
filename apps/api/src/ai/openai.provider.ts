import {
  AICompletionInput,
  AICompletionResult,
  AIProvider,
} from './provider.interface';

/** Minimal shape of the fields we read from the OpenAI chat completion. */
interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * OpenAI Chat Completions adapter. The API key is supplied at construction time
 * (decrypted by ProviderFactory) and kept private to this instance — it is only
 * ever sent to OpenAI in the `Authorization` header, never logged or returned.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';

  constructor(private readonly apiKey: string) {}

  async complete(input: AICompletionInput): Promise<AICompletionResult> {
    const { system, prompt, model } = input;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system || '' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      // The response body is the provider's own error message and never
      // contains our API key, so it is safe to surface for debugging.
      const detail = await safeReadBody(res);
      throw new Error(
        `OpenAI API request failed with status ${res.status}` +
          (detail ? `: ${detail}` : ''),
      );
    }

    const data = (await res.json()) as OpenAIChatResponse;
    const text = data.choices?.[0]?.message?.content ?? '';
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;

    return { text, inputTokens, outputTokens };
  }
}

/** Read a response body as text without throwing, truncated for safety. */
async function safeReadBody(res: Response): Promise<string> {
  try {
    const body = await res.text();
    return body.slice(0, 500);
  } catch {
    return '';
  }
}
