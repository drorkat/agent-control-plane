import { MockProvider } from './mock.provider';

// Loop mode is detected by the word `propose_changes` in the system prompt
// (see MockProvider / buildAgentLoopSystemPrompt).
const LOOP_SYSTEM = 'You work in steps. Finish with propose_changes.';

describe('MockProvider', () => {
  const provider = new MockProvider();

  /** Run a loop-mode completion and parse the single JSON action it returns. */
  async function loopAction(prompt: string): Promise<unknown> {
    const res = await provider.complete({
      system: LOOP_SYSTEM,
      prompt,
      model: 'm',
    });
    return JSON.parse(res.text);
  }

  it('emits a request_action for a [[action:...]] marker in loop mode', async () => {
    expect(await loopAction('Clean up [[action:delete_data]]')).toEqual({
      tool: 'request_action',
      action: 'delete_data',
    });
  });

  it('lower-cases the requested action name from the marker', async () => {
    expect(await loopAction('Ship it [[action:Merge_Pull_Request]]')).toEqual({
      tool: 'request_action',
      action: 'merge_pull_request',
    });
  });

  it('walks the normal loop (list_files first) when there is no marker', async () => {
    expect(
      await loopAction('Add a feature\n\n## Progress so far\n(nothing yet)'),
    ).toEqual({ tool: 'list_files' });
  });

  it('returns a free-text plan (not JSON) when not in loop mode', async () => {
    const res = await provider.complete({
      system: 'You are a planner.',
      prompt: 'Add a logout button',
      model: 'm',
    });
    expect(res.text).toContain('Plan for:');
    expect(res.inputTokens).toBeGreaterThan(0);
    expect(res.outputTokens).toBeGreaterThan(0);
  });
});
