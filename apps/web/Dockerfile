# Agent Control Plane — Web (Next.js) image.
# Multi-stage build for the npm-workspaces monorepo. Build context is the repo
# root: `docker build -f apps/web/Dockerfile .`
#
# next.config.mjs does not enable standalone output, so this is a normal
# `next build` + `next start`. Node 22 to match the repo's engines.

# ---------- build stage ----------
FROM node:22-slim AS builder
WORKDIR /app

# Install dependencies first for caching. All workspace manifests are needed for
# `npm ci`; the Prisma schema is required by @acp/api's postinstall hook, which
# runs during a root install even though only the web app is built here.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma apps/api/prisma
RUN npm ci

# Copy the source and build the Next.js app (outputs apps/web/.next).
COPY . .
RUN npm run -w @acp/web build

# ---------- runtime stage ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# `next start` needs node_modules, the build output, and next.config.mjs (which
# defines the /api/* proxy read from NEXT_PUBLIC_API_URL at runtime).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/next.config.mjs
COPY --from=builder /app/apps/web/.next ./apps/web/.next

EXPOSE 3000

# Runs `next start -p 3000` in the web workspace.
CMD ["npm", "run", "-w", "@acp/web", "start"]
