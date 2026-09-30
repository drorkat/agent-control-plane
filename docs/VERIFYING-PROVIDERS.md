# Verifying the real AI providers

The run engine talks to Anthropic and OpenAI through small adapters
(`apps/api/src/ai/anthropic.provider.ts`, `openai.provider.ts`). There are three
levels of verification, from "no key needed" to "full end-to-end".

## 1. Deterministic adapter tests (no key, always run in CI)

`anthropic.provider.spec.ts` and `openai.provider.spec.ts` mock `fetch` with
realistic provider payloads and assert:

- the request shape — endpoint, headers (`x-api-key` / `Authorization: Bearer`,
  `anthropic-version`, content type), and body (model, messages, `max_tokens`);
- response parsing — the completion text and the input/output token counts;
- error handling — a non-2xx surfaces the provider's status and message and
  **never leaks the API key**.

```bash
npm run test -w @acp/api
```

This proves every line of adapter logic without a network call or a key.

## 2. One-shot live smoke test (your key, one command)

`apps/api/scripts/smoke-provider.mjs` makes a single real completion, but only
when a key is present in the environment (otherwise it cleanly no-ops). Never
commit a key — pass it inline:

```bash
ANTHROPIC_API_KEY=sk-ant-...  node apps/api/scripts/smoke-provider.mjs
OPENAI_API_KEY=sk-...         node apps/api/scripts/smoke-provider.mjs
# optional model overrides:
ANTHROPIC_MODEL=claude-3-5-sonnet-latest  OPENAI_MODEL=gpt-4o-mini  node apps/api/scripts/smoke-provider.mjs
```

A `ACP smoke OK` reply plus non-zero token counts means the real path works.

## 3. Full end-to-end through the product (your key, BYOK via UI)

Keys are **bring-your-own** and entered in the app, never in env:

1. Start the stack with real providers: `AI_MOCK=0` (and `GITHUB_MOCK=0` to open
   real PRs).
2. In the app: **Settings → AI Providers** → add your Anthropic/OpenAI key (it is
   encrypted at rest with AES-256-GCM).
3. Create an agent whose `provider`/`model` match the key, assign it a task, and
   **Run**.
4. Watch the run detail: `MODEL_RESPONSE` carries the model's real output, and the
   run records real input/output tokens and cost.

This exercises decryption → the adapter → the multi-step loop → the gateway →
approval → (optionally) a real pull request.
