# syntax=docker/dockerfile:1
#
# Container images for the Azure beta (docs/azure/BETA_DEPLOYMENT.md). One file, four targets:
#   docker build --target api     -t <registry>/rein-drop-api:<tag> .
#   docker build --target worker  -t <registry>/rein-drop-worker:<tag> .
#   docker build --target web     -t <registry>/rein-drop-web:<tag> .
#   docker build --target migrate -t <registry>/rein-drop-migrate:<tag> .
# No secrets are baked in: every setting comes from the container environment at runtime.

ARG NODE_VERSION=24

# --- dependencies + build (shared) -------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
# Only what the server apps need (the mobile app is excluded by .dockerignore and these filters).
RUN pnpm install --frozen-lockfile --filter "api..." --filter "worker..." --filter "web..." --filter "@rein-drop/db..."
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=api --filter=worker --filter=web
# Self-contained production folders (workspace packages copied in, dev dependencies left out).
RUN pnpm --filter=api deploy --prod --legacy /out/api \
 && pnpm --filter=worker deploy --prod --legacy /out/worker

# --- runtime base -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Run as the image's unprivileged user.
USER node

# --- API (NestJS) -----------------------------------------------------------------------------
FROM runtime AS api
COPY --from=build --chown=node:node /out/api /app
EXPOSE 4000
CMD ["node", "dist/main.js"]

# --- worker (scheduler, searches, analysis, notifications) ------------------------------------
FROM runtime AS worker
COPY --from=build --chown=node:node /out/worker /app
CMD ["node", "dist/main.js"]

# --- web (Next.js standalone server) ----------------------------------------------------------
FROM runtime AS web
ENV PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone /app
COPY --from=build --chown=node:node /repo/apps/web/.next/static /app/apps/web/.next/static
# Static files served at stable URLs (e.g. /assets/brand/*) - the standalone server doesn't copy them.
COPY --from=build --chown=node:node /repo/apps/web/public /app/apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# --- database migrations (run as a Container Apps job, manually, before a release) ------------
FROM build AS migrate
WORKDIR /repo/packages/db
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]
