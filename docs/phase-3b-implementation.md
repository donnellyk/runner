# Phase 3b: Admin Tooling — Implementation Details

## Progress

- [ ] `is_admin` column on users table + migration
- [ ] Auto-admin for first registered user (Strava callback)
- [ ] Admin layout shell with route guard and sidebar navigation
- [ ] Users page (`/admin/users`)
- [ ] Activities page (`/admin/activities`)
- [ ] Queues page (`/admin/queues`)
- [ ] Strava page (`/admin/strava`)
- [ ] System page (`/admin/system`)
- [ ] `pg_stat_statements` extension enabled
- [ ] Bull Board standalone setup (dev task + prod container)
- [ ] `mise run console` task
- [ ] `mise run admin:promote` task
- [ ] `mise run studio` task
- [ ] Tests: admin guard, user admin toggle, job enqueue actions

---

## Overview

Internal tooling for inspecting data, managing queues, and debugging issues without direct DB or Redis access. Built right after the data pipeline when there's real data flowing.

This is a server-rendered admin panel — no client-side framework, no SPA routing, no Bull Board embed. All pages are SvelteKit routes with `+page.server.ts` load functions and form actions. Styling follows the existing pattern: Tailwind v4 utilities inline, no component library.

---

## 1. Schema Change: `is_admin`

### Migration

Add `is_admin` to the `users` table. New migration `0002_*.sql`:

```sql
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
```

### Schema Update

```typescript
// packages/db/src/schema/users.ts
isAdmin: boolean('is_admin').notNull().default(false),
```

### Auto-admin Logic

In `apps/web/src/routes/auth/strava/callback/+server.ts`, when inserting a new user, check if any users exist. If not, set `is_admin: true`:

```typescript
if (!user) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const isFirstUser = count === 0;

  [user] = await db.insert(users).values({
    stravaAthleteId,
    // ... existing fields
    isAdmin: isFirstUser,
  }).returning();
}
```

The count check and insert are not wrapped in a transaction. There's a theoretical race if two users register simultaneously, but this is a single-user app — pragmatically safe.

**Decision: No admin promotion UI in this phase beyond the users page toggle.**
The first user gets auto-admin. Additional admins are toggled from `/admin/users`. No self-service admin promotion.

### Dev Convenience: `mise run admin:promote`

For quickly promoting a user in development without the UI:

```toml
[tasks."admin:promote"]
description = "Promote a user to admin"
run = "pnpm tsx scripts/admin-promote.ts {{arg(name='user', default='first')}}"
```

```typescript
// scripts/admin-promote.ts
import { getDb } from '@web-runner/db/client';
import { users } from '@web-runner/db/schema';
import { eq, asc } from 'drizzle-orm';

const target = process.argv[2] || 'first';
const db = getDb();

let userId: number;
if (target === 'first') {
  const [first] = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
  if (!first) { console.error('No users found'); process.exit(1); }
  userId = first.id;
} else {
  userId = Number(target);
}

await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId));
console.log(`User ${userId} promoted to admin`);
process.exit(0);
```

Usage: `mise run admin:promote` (first user) or `mise run admin:promote 3` (user ID 3).

### Type Propagation

Adding `isAdmin` to the `users` schema automatically updates the `SessionUser` type (defined as `typeof users.$inferSelect` in `apps/web/src/lib/server/auth.ts`). The hooks middleware at `hooks.server.ts` calls `validateSessionToken()`, which selects all user columns — so `isAdmin` flows through to `locals.user` without changes to the auth layer.

---

## 2. Admin Route Guard

### Route Structure

```
apps/web/src/routes/(protected)/admin/
  +layout.server.ts     — admin guard: redirects non-admins to /
  +layout.svelte        — sidebar + content shell
  +page.server.ts       — redirects to /admin/users (no standalone admin index)
  +page.svelte          — not needed (redirect handles it)
  users/
    +page.server.ts     — load: user list with connection status
    +page.svelte        — user table
  activities/
    +page.server.ts     — load: activity list with filters; actions: re-queue, trigger sync
    +page.svelte        — activity table with filter controls
  queues/
    +page.server.ts     — load: queue stats; actions: trigger full sync, re-import single activity
    +page.svelte        — queue dashboard
  strava/
    +page.server.ts     — load: rate limit state, webhook subscription info
    +page.svelte        — rate limit gauges, webhook status
  system/
    +page.server.ts     — load: DB stats, Redis stats, connection info
    +page.svelte        — system overview
```

### Guard Implementation

```typescript
// (protected)/admin/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user?.isAdmin) {
    redirect(302, '/');
  }
};
```

This nests inside the existing `(protected)` group, which already handles the unauthenticated case (redirect to `/auth/login`). The admin guard uses `locals` directly (not `parent()`) to avoid TypeScript nullability issues with the root layout's `user: SessionUser | null` type. The `(protected)` layout guarantees `locals.user` is non-null at this point, but the `?.` operator satisfies the type checker.

### Sidebar Layout

The admin layout renders a sidebar with navigation links and a content area. The sidebar shows:
- App name + "Admin" badge
- Nav links: Users, Activities, Queues, Strava, System
- Current user name + link back to main app
- Active link highlighted based on `page.url.pathname`

```svelte
<!-- (protected)/admin/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  let { data, children } = $props();

  const navItems = [
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/activities', label: 'Activities' },
    { href: '/admin/queues', label: 'Queues' },
    { href: '/admin/strava', label: 'Strava' },
    { href: '/admin/system', label: 'System' },
  ];
</script>

<div class="flex min-h-screen">
  <nav class="w-56 border-r border-zinc-200 bg-zinc-50 p-4">
    <div class="text-sm font-bold uppercase tracking-wide text-zinc-500 mb-4">Admin</div>
    {#each navItems as item}
      <a
        href={item.href}
        class="block px-3 py-2 rounded text-sm {page.url.pathname.startsWith(item.href) ? 'bg-zinc-200 font-medium' : 'hover:bg-zinc-100'}"
      >
        {item.label}
      </a>
    {/each}
    <div class="mt-auto pt-8 border-t border-zinc-200 mt-8">
      <a href="/" class="text-sm text-zinc-500 hover:text-zinc-800">Back to app</a>
    </div>
  </nav>
  <main class="flex-1 p-8">
    {@render children()}
  </main>
</div>
```

Uses `$app/state` (Svelte 5) instead of the deprecated `$app/stores`. Access `page.url` directly (no `$` prefix).

---

## 3. Users Page (`/admin/users`)

### Load Function

Query all users with their Strava connection status:

```typescript
const userList = await db
  .select({
    id: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
    stravaAthleteId: users.stravaAthleteId,
    isAdmin: users.isAdmin,
    createdAt: users.createdAt,
    tokenExpiresAt: oauthAccounts.expiresAt,
  })
  .from(users)
  .leftJoin(oauthAccounts, and(
    eq(oauthAccounts.userId, users.id),
    eq(oauthAccounts.provider, 'strava'),
  ))
  .orderBy(users.id);
```

Also include per-user activity counts and last sync timestamp:

```typescript
const activityStats = await db
  .select({
    userId: activities.userId,
    count: sql<number>`count(*)`,
    lastSync: sql<string>`max(${activities.updatedAt})`,
  })
  .from(activities)
  .groupBy(activities.userId);
```

Join these in the load function and return a flat array.

### Actions

**Toggle admin** — form action with `userId` field:
```typescript
toggleAdmin: async ({ request, locals }) => {
  if (!locals.user?.isAdmin) { return fail(403); }

  const data = await request.formData();
  const userId = Number(data.get('userId'));
  if (userId === locals.user.id) { return fail(400, { error: 'Cannot toggle your own admin status' }); }

  const [target] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
  await db.update(users).set({ isAdmin: !target.isAdmin }).where(eq(users.id, userId));
}
```

The action re-validates admin status (defense in depth — the layout guard prevents non-admin access, but the action should also check). Prevents de-admining yourself.

### UI

Simple table with columns: Name, Strava ID, Admin (toggle button), Token Status (valid/expired/missing), Activities (count), Last Sync, Created.

---

## 4. Activities Page (`/admin/activities`)

### Load Function

Paginated activity list with filters. Query params for server-side filtering:

| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by `sync_status` (pending, streams_pending, complete, failed) |
| `sport` | string | Filter by `sport_type` |
| `user` | number | Filter by `user_id` |
| `page` | number | Page number, default 1 |

```typescript
const PAGE_SIZE = 50;
const offset = (page - 1) * PAGE_SIZE;

let query = db
  .select({
    id: activities.id,
    name: activities.name,
    sportType: activities.sportType,
    syncStatus: activities.syncStatus,
    startDate: activities.startDate,
    distance: activities.distance,
    movingTime: activities.movingTime,
    userId: activities.userId,
    externalId: activities.externalId,
    source: activities.source,
    userName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
  })
  .from(activities)
  .leftJoin(users, eq(activities.userId, users.id))
  .orderBy(desc(activities.startDate))
  .limit(PAGE_SIZE)
  .offset(offset);

// Apply filters dynamically via where conditions
```

Also return total count for pagination and distinct filter values (unique sport types, sync statuses, user list) for the filter dropdowns.

### Actions

**Re-queue failed imports** — enqueue `activity-import` for a specific activity:
```typescript
requeue: async ({ request }) => {
  const data = await request.formData();
  const activityId = Number(data.get('activityId'));
  const [activity] = await db.select({ userId: activities.userId, externalId: activities.externalId })
    .from(activities).where(eq(activities.id, activityId));

  const queue = getQueue();
  await queue.add('activity-import', {
    type: 'activity-import',
    userId: activity.userId,
    activityId: Number(activity.externalId),
  }, { priority: 5 });

  await db.update(activities).set({ syncStatus: 'pending' }).where(eq(activities.id, activityId));
}
```

**Trigger full sync** — enqueue `full-history-import` for a user:
```typescript
fullSync: async ({ request }) => {
  const data = await request.formData();
  const userId = Number(data.get('userId'));
  const queue = getQueue();
  await queue.add('full-history-import', {
    type: 'full-history-import',
    userId,
  }, { priority: 10 });
}
```

### UI

- Filter bar at top: dropdowns for status, sport, user + page controls
- Table: Name, Sport, Status (color-coded), Distance, Time, User, Date, Actions (re-queue button for failed)
- "Trigger Full Sync" button per user (or a global one with user selector)

### Inspecting Raw Data

Each activity row is clickable (or has an "inspect" button) that opens a detail view showing:
- All activity fields
- `source_raw` JSONB formatted
- Lap count and stream types present
- Segment count

This is a separate route (`/admin/activities/[id]`). Simpler than expandable rows, allows deep linking, and keeps the list page fast.

```
activities/
  +page.server.ts   — list
  +page.svelte      — table
  [id]/
    +page.server.ts — detail: activity + laps + streams + segments
    +page.svelte    — formatted detail view
```

### Detail Load Function

```typescript
// admin/activities/[id]/+page.server.ts
const activityId = Number(params.id);

const [activity] = await db.select().from(activities).where(eq(activities.id, activityId));
if (!activity) { error(404, 'Activity not found'); }

const laps = await db.select().from(activityLaps)
  .where(eq(activityLaps.activityId, activityId))
  .orderBy(activityLaps.lapIndex);

const streams = await db.select({ streamType: activityStreams.streamType, originalSize: activityStreams.originalSize })
  .from(activityStreams)
  .where(eq(activityStreams.activityId, activityId));

const segmentCount = await db.select({ count: sql<number>`count(*)` })
  .from(activitySegments)
  .where(eq(activitySegments.activityId, activityId));

return { activity, laps, streams, segmentCount: segmentCount[0]?.count ?? 0 };
```

The detail page shows all activity columns, formatted `source_raw` JSONB, lap table, stream type list with sizes, and segment count.

---

## 5. Queues Page (`/admin/queues`)

### Load Function

Use BullMQ's `Queue` API to get job counts and recent jobs. The web app already has `getQueue()`.

```typescript
const queue = getQueue();
const counts = await queue.getJobCounts('active', 'waiting', 'delayed', 'completed', 'failed');
const failedJobs = await queue.getFailed(0, 20);
const delayedJobs = await queue.getDelayed(0, 20);
const activeJobs = await queue.getActive(0, 20);
const completedJobs = await queue.getCompleted(0, 20);
```

Serialize job data for the page:

```typescript
function serializeJob(job: Job) {
  return {
    id: job.id,
    name: job.name,
    data: job.data,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
    delay: job.delay,
  };
}
```

### Actions

**Trigger full sync** for a user (same as activities page):
```typescript
triggerSync: async ({ request }) => {
  const data = await request.formData();
  const userId = Number(data.get('userId'));
  const queue = getQueue();
  await queue.add('full-history-import', { type: 'full-history-import', userId }, { priority: 10 });
}
```

**Re-import single activity**:
```typescript
reimport: async ({ request }) => {
  const data = await request.formData();
  const userId = Number(data.get('userId'));
  const activityId = Number(data.get('activityId'));
  const queue = getQueue();
  await queue.add('activity-import', { type: 'activity-import', userId, activityId }, { priority: 5 });
}
```

**Retry failed job** — remove the failed job and re-add it:
```typescript
retryFailed: async ({ request }) => {
  const data = await request.formData();
  const jobId = String(data.get('jobId'));
  const queue = getQueue();
  const job = await queue.getJob(jobId);
  if (job) {
    await job.retry();
  }
}
```

**Clean completed/failed** — bulk cleanup:
```typescript
clean: async ({ request }) => {
  const data = await request.formData();
  const status = String(data.get('status')); // 'completed' | 'failed'
  const queue = getQueue();
  await queue.clean(0, 1000, status);
}
```

### UI

- Summary cards at top: Active, Waiting, Delayed, Completed, Failed (counts)
- Tabs or sections for each job state, showing recent jobs with their data, timestamps, and failure reasons
- Action buttons: Trigger Full Sync (with user dropdown), Clean Completed, Clean Failed
- Manual activity re-import form: user ID + Strava activity ID fields

**Decision: Bull Board runs as a standalone process, not embedded in SvelteKit.**
The implementation plan specifies "Bull Board integration". Rather than embedding Bull Board into SvelteKit (which requires Express/Hono middleware that doesn't fit SvelteKit's routing), Bull Board runs as a separate lightweight Express server. The custom Queues page in the admin panel handles business-level actions (trigger sync, re-import by activity ID, rate limit awareness). Bull Board handles generic queue inspection (job data viewer, stack traces, promote, bulk operations, live refresh).

### Bull Board Standalone Setup

**Dependencies** (installed at the repo root, not in any app):
```bash
pnpm add -w @bull-board/api @bull-board/express @bull-board/api express bullmq
```

**Script:**
```typescript
// scripts/bull-board.ts
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const parsed = new URL(redisUrl);

const connection = {
  host: parsed.hostname,
  port: Number(parsed.port) || 6379,
  password: parsed.password || undefined,
  username: parsed.username || undefined,
};

const queue = new Queue('strava', { connection });
const serverAdapter = new ExpressAdapter();
createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });
serverAdapter.setBasePath('/');

const app = express();
const port = Number(process.env.BULL_BOARD_PORT) || 3001;
app.use('/', serverAdapter.getRouter());
app.listen(port, () => console.log(`Bull Board at http://localhost:${port}`));
```

**Dev** — mise task:
```toml
[tasks."bull-board"]
description = "Run Bull Board queue dashboard"
run = "pnpm tsx scripts/bull-board.ts"
```

Usage: `mise run bull-board` — opens at `http://localhost:3001`.

**Prod** — Docker Compose service:
```yaml
# docker-compose.yml
bull-board:
  build:
    context: .
    dockerfile: Dockerfile.bull-board
  ports:
    - "127.0.0.1:3001:3001"
  environment:
    REDIS_URL: redis://redis:6379
    BULL_BOARD_PORT: 3001
  depends_on:
    redis:
      condition: service_healthy
```

Port is bound to `127.0.0.1` only — not exposed publicly. Access in prod via SSH tunnel (`ssh -L 3001:localhost:3001 carthage`) or behind a reverse proxy with auth.

**Dockerfile:**
```dockerfile
# Dockerfile.bull-board
FROM node:23-alpine
WORKDIR /app
RUN npm install @bull-board/api @bull-board/express bullmq express
COPY scripts/bull-board.ts .
RUN npx tsc bull-board.ts --esModuleInterop --module nodenext --moduleResolution nodenext
CMD ["node", "bull-board.js"]
```

Alternatively, use `tsx` in the container to skip the compile step — trade-off is a larger image. The compiled approach keeps the image minimal.

**Security:** Bull Board has no built-in auth. In prod, it's only reachable via SSH tunnel or a reverse proxy that adds authentication. The `127.0.0.1` bind ensures it's never directly exposed to the internet.

---

## 6. Strava Page (`/admin/strava`)

### Load Function

Read rate limit counters directly from Redis:

```typescript
import { redis } from '$lib/server/redis';

const shortTerm = Number(await redis.get('strava:ratelimit:15min')) || 0;
const daily = Number(await redis.get('strava:ratelimit:daily')) || 0;
const shortTermTtl = await redis.ttl('strava:ratelimit:15min');
const dailyTtl = await redis.ttl('strava:ratelimit:daily');
```

Rate limit display:
- 15-min window: `{shortTerm} / 200` with TTL countdown
- Daily: `{daily} / 2000` with TTL countdown
- Color coding: green < 50%, yellow 50-80%, red > 80%

Webhook subscription status — read from env:
```typescript
const subscriptionId = process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID || null;
const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ? 'configured' : 'missing';
```

Also show the callback URL (from `STRAVA_REDIRECT_URI` base, replacing the path with `/api/webhooks/strava`).

### UI

Two sections:

**Rate Limits**
- Two horizontal bar gauges (15-min and daily) showing current usage vs. limit
- TTL displayed as "resets in Xm Ys" / "resets in Xh Ym"
- Percentage and raw numbers

**Webhook**
- Subscription ID (or "Not configured" warning)
- Verify token status: configured / missing
- Callback URL
- Link to webhook management CLI commands (`mise run webhook:list`, etc.)

No actions on this page — rate limits are read-only (managed by the worker), and webhook management is done via CLI.

---

## 7. System Page (`/admin/system`)

### Load Function

**Database stats:**
```typescript
const tableStatsResult = await db.execute(sql`
  SELECT
    relname AS table_name,
    n_live_tup AS row_count,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size
  FROM pg_stat_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
`);
const tableStats = tableStatsResult.rows;
```

Note: `db.execute()` returns a `pg` `QueryResult` object. Access `.rows` for the result array.

**pg_stat_statements** (top slow queries, if extension is enabled):
```typescript
const slowQueriesResult = await db.execute(sql`
  SELECT
    query,
    calls,
    round(total_exec_time::numeric, 2) AS total_time_ms,
    round(mean_exec_time::numeric, 2) AS mean_time_ms,
    rows
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 20
`);
const slowQueries = slowQueriesResult.rows;
```

Wrap in a try/catch — if `pg_stat_statements` isn't enabled, show a message instead of failing.

**Redis stats:**
```typescript
const redisInfo = await redis.info('memory');
const usedMemory = parseRedisInfo(redisInfo, 'used_memory_human');
const peakMemory = parseRedisInfo(redisInfo, 'used_memory_peak_human');

const keyCount = await redis.dbsize();
```

**Connection pool stats** (from pg `Pool`):
The Drizzle client wraps a `pg.Pool`. Pool stats (total, idle, waiting) require access to the pool instance. The current `createDb()` function creates the pool as a local variable and doesn't retain it. Refactor `client.ts` to store the pool reference:

```typescript
// packages/db/src/client.ts — refactored
let _pool: pg.Pool | null = null;
let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    _pool = new pg.Pool({ connectionString });
    _db = drizzle(_pool, { schema });
  }
  return _db;
}

export function getPoolStats() {
  if (!_pool) return null;
  return {
    totalCount: _pool.totalCount,
    idleCount: _pool.idleCount,
    waitingCount: _pool.waitingCount,
  };
}
```

### pg_stat_statements Setup

Two parts: the shared library must be loaded at server start, and the extension must be created in the database.

**1. Shared preload library** — add `command` override in `docker-compose.yml`:
```yaml
# docker-compose.yml — postgres service
command: >
  postgres
    -c shared_preload_libraries=pg_stat_statements
    -c pg_stat_statements.track=all
```

This replaces the default postgres command arguments but the entrypoint script still runs.

**2. Create extension** — use a Drizzle migration (not an init script, since Docker init scripts only run on first-time volume initialization and will be silently skipped on existing environments):

```sql
-- In the 0002_*.sql migration alongside the is_admin column change
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

This ensures the extension is created on both fresh and existing databases.

### UI

Three sections:

**Database**
- Table: table name, row count, total size
- Total DB size at bottom

**Slow Queries** (if pg_stat_statements enabled)
- Table: query (truncated), calls, total time, mean time, rows
- Sorted by mean execution time descending

**Redis**
- Memory: used / peak
- Key count
- Rate limit key values (duplicated from Strava page for convenience, or just a link)

**Backups**
- Last backup timestamp (read from the most recent file in the backup destination, or from a `last_backup` Redis key set by the backup script)
- Backup script path and schedule info

**Connection Pool**
- Total / idle / waiting counts

---

## 8. CLI Tooling

### `mise run console`

A Node REPL with pre-loaded DB, Redis, Strava client, and queue instances:

```typescript
// scripts/console.ts
import repl from 'node:repl';
import Redis from 'ioredis';
import { getDb } from '@web-runner/db/client';
import { StravaClient } from '@web-runner/strava';
import { Queue } from 'bullmq';
import * as schema from '@web-runner/db/schema';

const db = getDb();
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);
const queue = new Queue('strava', { connection: { host: 'localhost', port: 6379 } });
const strava = new StravaClient();

const r = repl.start('web-runner> ');
Object.assign(r.context, { db, redis, strava, queue, schema });
```

The console script creates its own Redis connection (it cannot import from the web app's `$lib/server/redis.ts` since that uses SvelteKit's `$lib` alias). It imports from monorepo workspace packages (`@web-runner/db`, `@web-runner/strava`) which resolve via pnpm workspace linking. The script runs via `pnpm tsx scripts/console.ts` from the root — `pnpm` resolves workspace deps even for root-level scripts since `tsx` inherits the monorepo's `node_modules`.

```toml
[tasks.console]
description = "Node REPL with DB, Redis, Strava, and queue pre-loaded"
run = "pnpm tsx scripts/console.ts"
```

### `mise run studio`

Drizzle Kit studio for schema-aware DB browsing:

```toml
[tasks.studio]
description = "Run Drizzle Kit Studio (local DB)"
run = "pnpm --filter @web-runner/db drizzle-kit studio"

[tasks."studio:prod"]
description = "Run Drizzle Kit Studio against prod via SSH tunnel"
run = """
HOST="${PROD_HOST:-carthage}"
echo "Opening SSH tunnel to $HOST Postgres..."
ssh -f -N -L 15432:localhost:5432 "$HOST"
trap 'pkill -f "ssh -f -N -L 15432:localhost:5432 $HOST"' EXIT
DATABASE_URL=postgresql://postgres:postgres@localhost:15432/webrunner pnpm --filter @web-runner/db drizzle-kit studio
"""
```

`studio:prod` opens an SSH tunnel on port 15432 (avoids conflicting with a local Postgres on 5432), runs Drizzle Studio pointed at the tunneled connection, and tears down the tunnel on exit. Credentials may differ in prod — if so, pass them via env or read from a secrets file. No tooling required on the server.

`carthage` is an SSH config host alias (defined in `~/.ssh/config`), consistent with `mise run deploy`. Override with `PROD_HOST` env var if needed — the task should use `${PROD_HOST:-carthage}`.

---

## 9. Testing Strategy

### Admin Guard

Test that the admin layout guard works:
- Non-admin user accessing `/admin/*` is redirected to `/`
- Admin user can access `/admin/*`

This is a server-side load function test. Mock `locals.user` with `isAdmin: true/false` and verify the redirect or pass-through behavior.

### User Admin Toggle

Test the `toggleAdmin` form action:
- Toggling another user's admin status works
- Toggling your own admin status is rejected
- Guard: non-admin users cannot call the action (the layout guard prevents it, but the action should also check)

### Job Enqueue Actions

Test that queue actions (trigger sync, re-queue, retry) add the expected jobs:
- Mock `getQueue()` to return a spy queue
- Call the form action with the expected form data
- Assert `queue.add` was called with the right job type and data

### Activity Filters

Test the load function with different query params:
- No filters returns all activities (paginated)
- Status filter returns only matching sync_status
- Combined filters apply correctly
- Pagination offset/limit are correct

---

## 10. File Structure

```
packages/db/
  src/schema/users.ts                    — add isAdmin column
  src/client.ts                          — add getPoolStats() export
  drizzle/0002_*.sql                     — migration: add is_admin

apps/web/src/routes/(protected)/admin/
  +layout.server.ts                      — admin guard
  +layout.svelte                         — sidebar shell
  +page.server.ts                        — redirect to /admin/users
  users/
    +page.server.ts                      — user list + toggle action
    +page.svelte
  activities/
    +page.server.ts                      — activity list + filters + actions
    +page.svelte
    [id]/
      +page.server.ts                    — activity detail (raw data, laps, streams, segments)
      +page.svelte
  queues/
    +page.server.ts                      — queue stats + job management actions
    +page.svelte
  strava/
    +page.server.ts                      — rate limits + webhook status
    +page.svelte
  system/
    +page.server.ts                      — DB stats, Redis stats, pool stats
    +page.svelte

apps/web/src/routes/auth/strava/callback/
  +server.ts                             — add auto-admin on first user

scripts/
  console.ts                             — REPL with pre-loaded clients
  admin-promote.ts                       — promote user to admin
  bull-board.ts                          — standalone Bull Board server

Dockerfile.bull-board                    — minimal image for prod Bull Board

docker-compose.yml                       — add pg_stat_statements config
mise.toml                                — add console + studio tasks
```

---

## 11. Dependencies

New packages needed in `apps/web`:
- None. BullMQ and ioredis are already installed.

New packages at repo root (for Bull Board standalone):
- `@bull-board/api`, `@bull-board/express`, `express`, `bullmq`

---

## 12. Decisions Summary

| Decision | Rationale |
|---|---|
| Bull Board as standalone process | Embedding in SvelteKit requires Express/Hono middleware. Standalone Express server runs on port 3001, accessed via SSH tunnel in prod. Custom Queues page handles business-level actions; Bull Board handles generic queue inspection. |
| `pg_stat_statements` via migration + compose command | Shared preload library set in compose command args. Extension created in a Drizzle migration (not a Docker init script, which only runs on first-time volume init). |
| Pool stats export from db package | Exposing `pg.Pool` stats requires access to the pool instance. A getter function is cleaner than exporting the pool directly. |
| Activity detail as separate route | `/admin/activities/[id]` is simpler than expandable rows. Allows deep linking and keeps the list page fast. |
| Rate limits read-only in admin | The worker manages rate limit state. Admin can observe but not modify. Manual override would be dangerous. |

