# Tech Debt Remediation Plan

Comprehensive plan to address issues identified by 5-agent review (Svelte Expert, Node.js Architect, Principal Engineer, Database Expert, DevOps Engineer).

## Phase 1: Critical — Correctness & Safety

### 1.1 Batch DB inserts in worker jobs
- [x] `activity-import.ts`: Lap inserts now inside transaction (batch not needed — small cardinality)
- [x] `activity-streams.ts`: Stream + segment inserts wrapped in transaction
- Note: Switched to transaction-based approach rather than raw batching since the atomicity guarantee was the real issue.

### 1.2 Transaction wrapping for compound operations
- [x] `activity-import.ts`: Activity upsert + lap inserts wrapped in `db.transaction()`
- [x] `activity-streams.ts`: Stream inserts + segment inserts + activity status update wrapped in `db.transaction()`

### 1.3 Worker global error handlers
- [x] Added `process.on('unhandledRejection')` and `process.on('uncaughtException')` to `apps/worker/src/index.ts`

### 1.4 Webhook payload validation
- [x] Added `validateWebhookEvent()` type guard in `+server.ts` — validates all required fields before enqueueing
- [x] Logs rejected payloads via pino logger
- Note: Used a type guard instead of Zod to keep dependencies minimal; the webhook has a small, fixed schema.

### 1.5 Token refresh error logging
- [x] Added HTTP status + response body logging to `packages/strava/src/tokens.ts`

### 1.6 Docker: Run as non-root
- [x] Added `USER node` to `apps/web/Dockerfile`
- [x] Added `USER node` to `apps/worker/Dockerfile`
- [x] Added `USER node` to `Dockerfile.bull-board`

## Phase 2: High — Reliability & Performance

### 2.1 Missing DB indexes + unique constraint
- [x] Added unique index `idx_oauth_accounts_user_provider` on `oauth_accounts(userId, provider)`
- [x] Added index `idx_sessions_user_id` on `sessions(userId)`
- Note: Schema changes applied; migration needs to be generated (`cd packages/db && pnpm run generate`)

### 2.2 Deduplicate activity upsert logic
- [x] Created `apps/worker/src/jobs/activity-values.ts` with `buildActivityValues()` and `buildActivityUpdateSet()`
- [x] Updated `activity-import.ts` and `full-history-import.ts` to use shared functions

### 2.3 Delete dead code
- [x] Deleted `apps/web/src/lib/server/strava-tokens.ts`

### 2.4 CI: Add production build step
- [x] Added `pnpm run build` step to `.github/workflows/ci.yml`

### 2.5 Docker: Restart policies & health checks
- [x] Added `restart: unless-stopped` to postgres, redis, web, worker, bull-board
- [x] Added health check for web service (curl to /api/health)
- [x] Changed caddy `depends_on` to use `service_healthy` condition

### 2.6 Admin activity page: defense-in-depth auth check
- [x] Added `isAdmin` guard in `admin/activities/[id]/+page.server.ts`

## Phase 3: Medium — Maintainability

### 3.1 Extract duplicated frontend helpers
- [x] Created `$lib/ui-helpers.ts` with `statusColor()`, `formatTime()`, `tokenStatus()`, `rowClick()`
- [x] Updated admin/activities, admin/users, admin/users/[id], (app)/activities pages to import

### 3.2 LapsChart: Import constant from format.ts
- [x] Exported `KM_TO_MI_PACE` from `$lib/format.ts`
- [x] Imported in `LapsChart.svelte` instead of redeclaring

### 3.3 Cursor pagination tie-breaker
- [x] Added `activities.id` as secondary sort + composite cursor `(startDate, id)` in `listActivities()`

### 3.4 Webhook: Use consistent env access
- [x] Replaced `process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID` with `env.STRAVA_WEBHOOK_SUBSCRIPTION_ID`

## Progress Tracker

| Phase | Item | Status |
|-------|------|--------|
| 1.1 | Batch DB inserts | done |
| 1.2 | Transaction wrapping | done |
| 1.3 | Worker error handlers | done |
| 1.4 | Webhook validation | done |
| 1.5 | Token refresh logging | done |
| 1.6 | Docker non-root | done |
| 2.1 | DB indexes | done |
| 2.2 | Deduplicate upsert | done |
| 2.3 | Delete dead code | done |
| 2.4 | CI build step | done |
| 2.5 | Docker restart/health | done |
| 2.6 | Admin auth check | done |
| 3.1 | Extract frontend helpers | done |
| 3.2 | LapsChart constant | done |
| 3.3 | Cursor pagination fix | done |
| 3.4 | Webhook env consistency | done |

## Notes

- All 145 tests pass
- No new lint errors introduced (reduced from 26 to 22 pre-existing errors)
- No new svelte-check errors (8 pre-existing errors in admin/strava/+page.svelte remain)
- DB schema changes (2.1) require migration generation before deploy
