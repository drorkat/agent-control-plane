# Agent Control Plane — API (NestJS) image.
# Multi-stage build for the npm-workspaces monorepo. Build context is the repo
# root: `docker build -f apps/api/Dockerfile .`
#
# Node 22 to match the repo's engines (">=22") and .nvmrc.

# ---------- build stage ----------
FROM node:22-slim AS builder
WORKDIR /app

# OpenSSL is required by Prisma's query engine (and to generate the client).
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first, for better layer caching. Copy the root manifest,
# the lockfile, and every workspace manifest so `npm ci` can resolve the
# workspaces. The Prisma schema is copied too because @acp/api's postinstall
# runs `prisma generate`, which needs it.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma apps/api/prisma
RUN npm ci

# Copy the rest of the source and build the API.
COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run -w @acp/api build

# ---------- runtime stage ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Bring over installed dependencies (including the generated Prisma client and
# the Prisma CLI, used for `db push` at startup), the compiled API, and the
# schema. The Prisma CLI is a dev dependency, so node_modules is copied whole
# rather than pruned.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

EXPOSE 4000

# Ensure the database schema exists (the repo uses `prisma db push`, not
# migrations), then start the server. DATABASE_URL is supplied by the environment
# (see docker-compose.yml).
CMD ["sh", "-c", "npx prisma db push --schema apps/api/prisma/schema.prisma --skip-generate && node apps/api/dist/main.js"]
