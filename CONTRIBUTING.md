# Contributing

Thanks for your interest in Agent Control Plane! This project is in early
development — issues, discussions, and pull requests are all welcome.

## Setting up locally

See the **Local development (without Docker)** section of the
[README](./README.md) for the full setup. In short: Node.js 22+, a PostgreSQL
database, then:

```bash
cp .env.example .env      # set DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY
npm install
npm run db:push           # create the schema
npm run dev               # API on :4000, web on :3000
```

Tip: set `AI_MOCK=1` and `GITHUB_MOCK=1` in `.env` to run the full agent loop
without real provider keys or a GitHub token.

## Branches and pull requests

- Work on a feature branch off `main` (e.g. `feature/…` or `fix/…`); don't commit
  to `main` directly.
- Keep pull requests small and focused on a single change, with a clear title and
  a description of what and why. Link any related issue.
- Make sure the project builds before opening or updating a PR (see below).

## Checks and builds

There is no separate type-check step — the builds run the TypeScript compiler, so
a clean build is the type check. Run them for the parts you touched (or both):

```bash
npm run -w @acp/api build     # NestJS build (type-checks apps/api)
npm run -w @acp/web build     # Next.js build (type-checks apps/web)
npm run -w @acp/web lint      # ESLint for the web app
```

`npm run build` from the root builds both apps. If you change the Prisma schema,
run `npm run db:generate` (and `npm run db:push` to apply it to your database).

## Code style

- TypeScript everywhere; match the style and structure of the surrounding code.
- Keep changes small and focused.
- Every business entity carries `organizationId` (the schema is tenant-aware).
- No secrets in code, configuration, or prompts — provider keys and tokens are
  encrypted at rest and decrypted only at tool-execution time.

## Sign-off (DCO)

This project uses the [Developer Certificate of Origin](https://developercertificate.org/)
rather than a CLA, to keep contributing lightweight. Every commit must be signed
off:

```bash
git commit -s -m "your message"
```

This adds a `Signed-off-by:` line certifying you have the right to submit the
change.

## License

By contributing, you agree that your contributions are licensed under
[AGPL-3.0](./LICENSE), the project's license.
