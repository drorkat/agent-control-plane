// Runs (via jest `setupFiles`) BEFORE the test file imports AppModule, so the
// secrets AuthModule reads at import time are already present. DATABASE_URL must
// be supplied by the environment (a Postgres service in CI, or your local DB);
// everything else gets a safe, non-placeholder default for the test run.
process.env.AUTH_SECRET ||= 'e2e-auth-secret-' + 'a'.repeat(40);
process.env.ENCRYPTION_KEY ||= 'e2e-encryption-key-' + 'b'.repeat(40);
process.env.AI_MOCK ||= '1';
process.env.GITHUB_MOCK ||= '1';
process.env.WEBHOOK_ALLOW_PRIVATE ||= '1';
// These tests sign up many accounts from a single IP in quick succession, which
// would otherwise trip the auth rate limit. Turn the throttler off for the run
// (honoured via ThrottlerModule's `skipIf` in AppModule).
process.env.THROTTLE_DISABLED ||= '1';
