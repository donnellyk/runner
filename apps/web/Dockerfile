FROM node:23.5.0-slim AS base
RUN npm install -g corepack && corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/strava/package.json packages/strava/package.json
RUN pnpm install --frozen-lockfile

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/strava/node_modules ./packages/strava/node_modules
COPY . .
RUN pnpm --filter @web-runner/web build

# --- production ---
FROM base AS production
COPY --from=build /app/apps/web/build ./apps/web/build
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/strava/node_modules ./packages/strava/node_modules
COPY packages ./packages
COPY package.json pnpm-workspace.yaml ./

COPY apps/web/entrypoint.sh /app/apps/web/entrypoint.sh
RUN mkdir -p /tmp/web-runner-imports && chown node:node /tmp/web-runner-imports

WORKDIR /app/apps/web
EXPOSE 3000
ENV PORT=3000
USER node
CMD ["./entrypoint.sh"]
