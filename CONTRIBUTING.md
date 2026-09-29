# Contributing

Thanks for your interest in Agent Control Plane! This project is in early development — issues, discussions and pull requests are all welcome.

## Running locally

Requirements: Node.js 22+, Docker.

```bash
cp .env.example .env
docker compose up -d      # PostgreSQL + Adminer
npm install
npm run db:push           # apply the schema
npm run dev               # API on :4000, web on :3000
```

## Sign-off (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/). Every commit must be signed off:

```bash
git commit -s -m "your message"
```

This adds a `Signed-off-by:` line certifying you have the right to submit the change. We use the DCO instead of a CLA to keep contributing lightweight.

## Style

- TypeScript everywhere. Keep changes small and focused.
- Every business entity carries `organizationId` (tenant-aware schema).
- No secrets in code, config, or prompts.

## License

By contributing, you agree that your contributions are licensed under [AGPL-3.0](./LICENSE).
