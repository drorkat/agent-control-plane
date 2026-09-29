/**
 * Approximate, per-model token pricing used to estimate the USD cost of a run.
 *
 * NOTE: these prices are approximate public list prices (USD per 1,000,000
 * tokens) captured for convenience and are intended to be configurable — they
 * drift over time and should be treated as estimates, not billing truth. Any
 * model not listed falls back to a price of 0 so an unknown model never blocks
 * a run; it simply reports a $0 estimate.
 */

interface ModelPrice {
  /** USD per 1M input (prompt) tokens. */
  inputPer1M: number;
  /** USD per 1M output (completion) tokens. */
  outputPer1M: number;
}

const PRICING: Record<string, ModelPrice> = {
  // Anthropic (approximate)
  'claude-3-5-sonnet-latest': { inputPer1M: 3, outputPer1M: 15 },
  'claude-3-5-sonnet-20241022': { inputPer1M: 3, outputPer1M: 15 },
  'claude-3-5-haiku-latest': { inputPer1M: 0.8, outputPer1M: 4 },
  'claude-3-opus-latest': { inputPer1M: 15, outputPer1M: 75 },
  'claude-3-haiku-20240307': { inputPer1M: 0.25, outputPer1M: 1.25 },
  // OpenAI (approximate)
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4-turbo': { inputPer1M: 10, outputPer1M: 30 },
  'gpt-3.5-turbo': { inputPer1M: 0.5, outputPer1M: 1.5 },
};

/** Default price for unknown models: no estimate. */
const DEFAULT_PRICE: ModelPrice = { inputPer1M: 0, outputPer1M: 0 };

/**
 * Compute the estimated USD cost of a completion, rounded to 6 decimal places
 * (matching the Run.costUsd Decimal(12,6) column).
 */
export function computeCostUsd(
  model: string,
  inTok: number,
  outTok: number,
): number {
  const price = PRICING[model] ?? DEFAULT_PRICE;
  const cost =
    (inTok / 1_000_000) * price.inputPer1M +
    (outTok / 1_000_000) * price.outputPer1M;
  // Round to 6 decimals.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
