/**
 * A provider-agnostic contract for a single LLM completion. Concrete adapters
 * (Anthropic, OpenAI, Mock) implement this so the run engine never has to know
 * which vendor it is talking to.
 */

export interface AICompletionInput {
  /** Optional system prompt / instructions. */
  system?: string;
  /** The user prompt to complete. */
  prompt: string;
  /** The vendor-specific model identifier to run against. */
  model: string;
}

export interface AICompletionResult {
  /** The model's text output. */
  text: string;
  /** Prompt/input token usage as reported by the provider. */
  inputTokens: number;
  /** Completion/output token usage as reported by the provider. */
  outputTokens: number;
}

export interface AIProvider {
  /** Short provider name, e.g. "anthropic", "openai", "mock". */
  name: string;
  complete(input: AICompletionInput): Promise<AICompletionResult>;
}
