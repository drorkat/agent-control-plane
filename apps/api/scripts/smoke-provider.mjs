// Guarded real-provider smoke test.
//
// Runs ONE real completion against Anthropic and/or OpenAI, but ONLY when a key
// is present in the environment — otherwise it cleanly no-ops (the deterministic
// adapter unit tests already cover the request/response logic without a key).
//
// Never commit a key. Pass it inline for a one-off check:
//   ANTHROPIC_API_KEY=sk-ant-...  node apps/api/scripts/smoke-provider.mjs
//   OPENAI_API_KEY=sk-...         node apps/api/scripts/smoke-provider.mjs
//   ANTHROPIC_MODEL=claude-3-5-sonnet-latest  (optional override)
//   OPENAI_MODEL=gpt-4o-mini                  (optional override)

const PROMPT = 'Reply with exactly: ACP smoke OK';

async function anthropic(apiKey) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 64,
      messages: [{ role: 'user', content: PROMPT }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return {
    model,
    text: data.content?.[0]?.text ?? '',
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

async function openai(apiKey) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: PROMPT }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return {
    model,
    text: data.choices?.[0]?.message?.content ?? '',
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

(async () => {
  const a = process.env.ANTHROPIC_API_KEY;
  const o = process.env.OPENAI_API_KEY;
  if (!a && !o) {
    console.log(
      'No ANTHROPIC_API_KEY / OPENAI_API_KEY set — skipping the live smoke test.\n' +
        'The deterministic adapter tests (npm test) already cover the request/response logic.',
    );
    process.exit(0);
  }
  if (a) console.log('Anthropic:', await anthropic(a));
  if (o) console.log('OpenAI:', await openai(o));
  console.log('\nLive smoke test done. (A "ACP smoke OK" reply + non-zero tokens = the real path works.)');
})().catch((err) => {
  console.error('Smoke test failed:', err.message);
  process.exit(1);
});
