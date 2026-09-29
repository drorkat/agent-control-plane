import {
  AICompletionInput,
  AICompletionResult,
  AIProvider,
} from './provider.interface';

/** Minimal shape of the fields we read from the Anthropic Messages response. */
interface AnthropicMessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Anthropic Messages API adapter. The API key is supplied at construction time
 * (decrypted by ProviderFactory) and kept private to this instance — it is only
 * ever sent to Anthropic in the `x-api-key` header, never logged or returned.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';

  constructor(private readonly apiKey: string) {}

  async complete(input: AICompletionInput): Promise<AICompletionResult> {
    const { system, prompt, model } = input;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      // The response body is the provider's own error message and never
      // contains our API key, so it is safe to surface for debugging.
      const detail = await safeReadBody(res);
      throw new Error(
        `Anthropic API request failed with status ${res.status}` +
          (detail ? `: ${detail}` : ''),
      );
    }

    const data = (await res.json()) as AnthropicMessagesResponse;
    const text = data.content?.[0]?.text ?? '';
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;

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
