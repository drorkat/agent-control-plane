import { computeCostUsd } from './pricing';

describe('computeCostUsd', () => {
  it('charges the listed input price per 1M input tokens', () => {
    // gpt-4o: $2.5 / 1M input tokens.
    expect(computeCostUsd('gpt-4o', 1_000_000, 0)).toBe(2.5);
  });

  it('charges the listed output price per 1M output tokens', () => {
    // gpt-4o: $10 / 1M output tokens.
    expect(computeCostUsd('gpt-4o', 0, 1_000_000)).toBe(10);
  });

  it('sums input and output cost for a known model', () => {
    // claude-3-5-sonnet-latest: $3 input + $15 output per 1M.
    expect(computeCostUsd('claude-3-5-sonnet-latest', 1_000_000, 1_000_000)).toBe(
      18,
    );
  });

  it('is proportional to token counts', () => {
    const one = computeCostUsd('gpt-4o', 1_000_000, 0);
    const two = computeCostUsd('gpt-4o', 2_000_000, 0);
    expect(two).toBeCloseTo(one * 2, 9);
    expect(two).toBe(5);
  });

  it('returns a positive cost for a known model with non-zero tokens', () => {
    expect(computeCostUsd('gpt-4o', 500_000, 500_000)).toBeGreaterThan(0);
  });

  it('returns 0 for an unknown model (default price) without throwing', () => {
    expect(() =>
      computeCostUsd('totally-made-up-model', 1_000_000, 1_000_000),
    ).not.toThrow();
    expect(computeCostUsd('totally-made-up-model', 1_000_000, 1_000_000)).toBe(0);
  });

  it('returns 0 when there are zero tokens', () => {
    expect(computeCostUsd('gpt-4o', 0, 0)).toBe(0);
  });

  it('rounds the result to 6 decimal places', () => {
    // 7 input tokens on gpt-4o-mini ($0.15/1M) = 0.00000105 -> 0.000001.
    expect(computeCostUsd('gpt-4o-mini', 7, 0)).toBeCloseTo(0.000001, 9);
  });
});
