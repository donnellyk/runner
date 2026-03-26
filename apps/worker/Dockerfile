FROM node:23.5.0-slim AS base
RUN npm install -g corepack && corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/strava/package.json packages/strava/package.json
RUN pnpm install --frozen-lockfile

# --- production ---
FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/strava/node_modules ./packages/strava/node_modules
COPY . .

RUN mkdir -p /tmp/web-runner-imports && chown node:node /tmp/web-runner-imports

WORKDIR /app/apps/worker
USER node
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
