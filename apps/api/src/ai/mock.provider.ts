import {
  AICompletionInput,
  AICompletionResult,
  AIProvider,
} from './provider.interface';

/**
 * A network-free provider used for local development and tests (enabled via
 * AI_MOCK=1). It returns a short, plausible "plan" that references the incoming
 * prompt and reports fake — but deterministic — token usage.
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock';

  async complete(input: AICompletionInput): Promise<AICompletionResult> {
    const { prompt } = input;

    // Use the first non-empty line of the prompt (typically the task title) so
    // the generated plan clearly references what was asked.
    const topic =
      prompt
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? 'the task';

    const text = [
      `Plan for: ${topic}`,
      '',
      '1. Clarify the requirements and acceptance criteria.',
      '2. Explore the relevant parts of the codebase.',
      '3. Implement the change in small, reviewable steps.',
      '4. Add or update tests and run the suite.',
      '5. Summarize the work and open a pull request for review.',
    ].join('\n');

    // Fake usage: roughly 4 characters per token, as specified.
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(text.length / 4);

    return { text, inputTokens, outputTokens };
  }
}
