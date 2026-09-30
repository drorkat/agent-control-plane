// Security-critical configuration, validated at boot so the app fails fast (and
// loudly) rather than running with a forgeable session secret or a default
// at-rest encryption key. This directly closes the "shipped default secret"
// class of vulnerability: there is no silent fallback anywhere.

/** Values we ship in .env.example / docs — never acceptable at runtime. */
const PLACEHOLDERS = new Set<string>([
  '',
  'change-me-in-production-please-use-32-chars-min',
  'dev-secret-change-me',
  'change-me-a-long-random-encryption-secret-min-32-chars',
  'dev-local-encryption-key-not-for-production-change-me',
]);

const MIN_LENGTH = 32;

function problemsFor(name: string, value: string | undefined): string[] {
  const problems: string[] = [];
  const v = (value ?? '').trim();
  if (v === '') {
    problems.push(`${name} is not set`);
  } else if (PLACEHOLDERS.has(v)) {
    problems.push(`${name} is a known placeholder — set a real, random value`);
  } else if (v.length < MIN_LENGTH) {
    problems.push(`${name} must be at least ${MIN_LENGTH} characters`);
  }
  return problems;
}

/**
 * Refuse to boot unless AUTH_SECRET and ENCRYPTION_KEY are set, long enough, and
 * not a known placeholder. Called first thing in bootstrap(), before the Nest
 * app (and its JwtModule) is created.
 */
export function assertSecureConfig(): void {
  const problems = [
    ...problemsFor('AUTH_SECRET', process.env.AUTH_SECRET),
    ...problemsFor('ENCRYPTION_KEY', process.env.ENCRYPTION_KEY),
  ];
  if (problems.length > 0) {
    throw new Error(
      'Insecure configuration — refusing to start:\n' +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\n\nGenerate strong, unique values (e.g. `openssl rand -hex 32`) and set\n' +
        'AUTH_SECRET and ENCRYPTION_KEY in the environment (.env). They must differ\n' +
        'from the placeholders in .env.example.',
    );
  }
}

/** The JWT signing secret. Guaranteed present by {@link assertSecureConfig}. */
export function authSecret(): string {
  return process.env.AUTH_SECRET as string;
}
