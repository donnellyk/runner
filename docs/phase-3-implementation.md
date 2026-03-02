# Phase 3: Strava Data Pipeline — Implementation Details

## Progress

- [x] Strava API client (`packages/strava`): client, types, errors, token refresh, mapping
- [x] App-level sport/workout type enums (`packages/shared`)
- [x] Database schema: `activities`, `activity_laps`, `activity_streams`, `activity_segments`
- [x] Migration for Phase 3 tables + PostGIS indexes
- [x] Webhook endpoint (GET validation + POST event receiver)
- [x] Job handlers: `full-history-import`, `activity-import`, `activity-streams`, `webhook-event`
- [x] Segment computation (500m splits with min/max/avg metrics + route geometry)
- [x] Redis-backed rate limiter
- [x] Webhook subscription management CLI (`mise run webhook:subscribe/list/delete`)
- [x] Webhook simulation CLI (`mise run webhook:simulate`)
- [x] Seed data tooling (`mise run seed:dump/restore`)
- [x] `SYNC_AFTER` env var for dev import limiting
- [x] Tests: Strava client, DB upserts, job handlers, segments, rate limiter, webhook endpoint

## Overview

Import and store activity data from Strava. This phase builds the data foundation for all downstream features (activity views, training plans, workout scoring). The pipeline must be idempotent, crash-safe, and respectful of Strava's rate limits.

---

## 1. Strava API Client (`packages/strava`)

### Endpoints

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /athlete/activities` | List activities (paginated) | `before`/`after` epoch params, `per_page` max 200 |
| `GET /activities/{id}` | Activity detail + laps | Returns splits, laps, gear, segment efforts |
| `GET /activities/{id}/streams` | Time-series data | Stream types requested via `keys` query param |
| `GET /activities/{id}/laps` | Lap data | Separate from detail endpoint for cleaner typing |

### Stream Types

Request all available streams per activity:
`time`, `distance`, `latlng`, `altitude`, `heartrate`, `cadence`, `watts`, `temp`, `moving`, `grade_smooth`, `velocity_smooth`

Not all streams exist for every activity (e.g., no `heartrate` without a HR monitor, no `watts` without a power meter). The client should request all and store whatever comes back.

### Client Design

```
packages/strava/src/
  index.ts          # Public API re-exports
  client.ts         # StravaClient class
  types.ts          # API response types (SummaryActivity, DetailedActivity, Stream, Lap, etc.)
  errors.ts         # StravaApiError, StravaRateLimitError
```

The client is a thin HTTP wrapper — no rate limiting or retry logic built in. Rate limiting is the queue's responsibility (see section 4). The client takes an access token per request, keeping it stateless.

```typescript
class StravaClient {
  constructor(private baseUrl = 'https://www.strava.com/api/v3') {}

  async listActivities(token: string, opts: { before?: number; after?: number; page?: number; perPage?: number }): Promise<SummaryActivity[]>
  async getActivity(token: string, id: number): Promise<DetailedActivity>
  async getActivityStreams(token: string, id: number, keys: StreamKey[]): Promise<StreamSet>
  async getActivityLaps(token: string, id: number): Promise<Lap[]>
}
```

**Decision: Stateless client, no built-in rate limiting.**
The client doesn't know about rate limits, retries, or token refresh. Those concerns belong to the job handlers in the worker, which have access to the queue and can reschedule work. This keeps the client testable and reusable.

### Token Refresh

The existing `getValidStravaToken(userId)` in `apps/web/src/lib/server/strava-tokens.ts` handles token refresh. The worker needs access to this — it should be extracted to a shared location or the worker should import it from the web app's server lib via a shared package.

**Decision: Move token refresh logic to `packages/strava`.**
Token refresh is a Strava concern, not a web-app concern. The refresh function needs DB access (to read/write oauth_accounts), so it takes a DB instance as a parameter rather than importing the singleton.

```typescript
// packages/strava/src/tokens.ts
async function getValidToken(db: Database, userId: number): Promise<string>
```

---

## 2. Database Schema

The schema is source-agnostic. The `activities` table uses its own primary key, sport types, and workout types — not Strava's. A mapping layer in `packages/strava` translates between Strava's values and ours. If a second source is added later (Garmin, Coros), it gets its own mapping without schema changes.

### Sport & Workout Type Mapping

App-level enums defined in `packages/shared`, with mapping functions per source in `packages/strava`:

```typescript
// packages/shared/src/activity-types.ts
export const SportType = {
  RUN: 'run',
  TRAIL_RUN: 'trail_run',
  RIDE: 'ride',
  SWIM: 'swim',
  WALK: 'walk',
  HIKE: 'hike',
  OTHER: 'other',
} as const;

export const WorkoutType = {
  DEFAULT: 'default',
  RACE: 'race',
  LONG_RUN: 'long_run',
  WORKOUT: 'workout',
} as const;

// packages/strava/src/mapping.ts
export function mapStravaSportType(stravaSportType: string): SportType { ... }
export function mapStravaWorkoutType(stravaWorkoutType: number | null): WorkoutType { ... }
```

The mapping is 1:1 for now but codifies the boundary. Strava's `TrailRun` maps to our `trail_run`, Strava's workout_type `1` maps to our `race`, etc. Unknown values map to `other`/`default`.

### `activities` table

```sql
CREATE TABLE activities (
  id              SERIAL PRIMARY KEY,
  external_id     TEXT NOT NULL,               -- source activity ID (e.g., Strava activity ID)
  source          TEXT NOT NULL DEFAULT 'strava',
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  sport_type      TEXT NOT NULL,               -- app-level: run, trail_run, ride, etc.
  workout_type    TEXT,                        -- app-level: default, race, long_run, workout
  distance        DOUBLE PRECISION,            -- meters
  moving_time     INTEGER,                     -- seconds
  elapsed_time    INTEGER,                     -- seconds
  total_elevation_gain DOUBLE PRECISION,       -- meters
  start_date      TIMESTAMP WITH TIME ZONE NOT NULL,
  start_latlng    DOUBLE PRECISION[2],         -- [lat, lng]
  end_latlng      DOUBLE PRECISION[2],
  average_speed   DOUBLE PRECISION,            -- m/s
  max_speed       DOUBLE PRECISION,            -- m/s
  average_heartrate DOUBLE PRECISION,
  max_heartrate   DOUBLE PRECISION,
  average_cadence DOUBLE PRECISION,
  average_watts   DOUBLE PRECISION,
  has_heartrate   BOOLEAN NOT NULL DEFAULT false,
  has_power       BOOLEAN NOT NULL DEFAULT false,
  device_name     TEXT,
  gear_id         TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'pending',  -- pending | streams_pending | complete | failed
  route           GEOMETRY(LINESTRING, 4326),  -- full GPS track as PostGIS geometry, nullable (not all activities have GPS)
  source_raw      JSONB,                       -- full API response from the source, for future-proofing and backfill
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(source, external_id)
);

CREATE INDEX idx_activities_user_id ON activities(user_id);
CREATE INDEX idx_activities_start_date ON activities(start_date);
CREATE INDEX idx_activities_sync_status ON activities(sync_status);
CREATE INDEX idx_activities_sport_type ON activities(sport_type);
CREATE INDEX idx_activities_route ON activities USING GIST(route);
```

**Decision: Surrogate primary key with `(source, external_id)` unique constraint.**
The app uses its own serial PK, decoupled from any source's ID scheme. Upserts target the `(source, external_id)` unique constraint. This supports multiple sources without PK conflicts and keeps foreign keys simple (integer references instead of composite keys).

**Decision: `sync_status` as a text column, not a Postgres enum.**
Postgres enums require migrations to add values. A text column with application-level validation (via Drizzle's type system) is more flexible. The valid states are:
- `pending` — activity metadata imported from list endpoint, no detail/streams yet
- `streams_pending` — detail + laps fetched, streams not yet fetched
- `complete` — all data imported
- `failed` — import failed after retries

**Decision: Store `source_raw` JSONB column.**
The raw API response from whatever source imported the activity. For Strava, this is the full activity detail response (~2-5KB). Enables backfilling new fields without re-fetching from the API (important given rate limits). Each source's raw format is different, but that's fine — the column is opaque storage, only interpreted by the source's mapping layer.

### `activity_laps` table

```sql
CREATE TABLE activity_laps (
  id              SERIAL PRIMARY KEY,
  activity_id     BIGINT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  lap_index       INTEGER NOT NULL,
  elapsed_time    INTEGER,            -- seconds
  moving_time     INTEGER,            -- seconds
  distance        DOUBLE PRECISION,   -- meters
  start_date      TIMESTAMP WITH TIME ZONE,
  total_elevation_gain DOUBLE PRECISION,
  average_speed   DOUBLE PRECISION,
  max_speed       DOUBLE PRECISION,
  average_heartrate DOUBLE PRECISION,
  max_heartrate   DOUBLE PRECISION,
  average_cadence DOUBLE PRECISION,
  average_watts   DOUBLE PRECISION,
  UNIQUE(activity_id, lap_index)
);
```

### `activity_streams` table

```sql
CREATE TABLE activity_streams (
  activity_id     BIGINT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  stream_type     TEXT NOT NULL,      -- time, distance, heartrate, altitude, etc.
  data            JSONB NOT NULL,     -- array of values
  original_size   INTEGER,            -- Strava's reported original_size
  resolution      TEXT,               -- Strava's reported resolution
  PRIMARY KEY (activity_id, stream_type)
);
```

**Decision: Store streams as JSONB arrays per stream type, not as row-per-timestamp.**
The implementation plan suggested a composite PK of `(activity_id, timestamp)` — one row per data point. That approach creates millions of rows for a moderate activity history (a single activity can have 3,000+ data points across 11 stream types).

Storing each stream type as a single JSONB array per activity:
- A 1-hour activity with 11 stream types = 11 rows instead of ~33,000
- Reads are a single row fetch per stream type, not an aggregation query
- Writes are a single upsert per stream type, not thousands of inserts
- JSONB arrays compress well
- Chart rendering reads the whole array anyway — no benefit to row-level access

Trade-off: You lose the ability to query individual data points via SQL (e.g., "find all timestamps where heartrate > 180"). This is mitigated by the `activity_segments` table below, which provides queryable aggregates at 500m granularity. Detailed per-datapoint analysis happens in application code (Phase 6).

### `activity_segments` table

Pre-computed 500m segments with spatial geometry and performance metrics. Derived from the full stream data at import time. Enables spatial + performance queries without parsing JSONB arrays.

```sql
CREATE TABLE activity_segments (
  id              SERIAL PRIMARY KEY,
  activity_id     INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  segment_index   INTEGER NOT NULL,
  route           GEOMETRY(LINESTRING, 4326),
  distance_start  DOUBLE PRECISION NOT NULL,   -- meters from activity start
  distance_end    DOUBLE PRECISION NOT NULL,
  duration        INTEGER,                     -- seconds for this segment
  avg_pace        DOUBLE PRECISION,            -- sec/km
  min_pace        DOUBLE PRECISION,            -- sec/km (fastest)
  max_pace        DOUBLE PRECISION,            -- sec/km (slowest)
  avg_heartrate   DOUBLE PRECISION,
  min_heartrate   DOUBLE PRECISION,
  max_heartrate   DOUBLE PRECISION,
  avg_cadence     DOUBLE PRECISION,
  min_cadence     DOUBLE PRECISION,
  max_cadence     DOUBLE PRECISION,
  avg_power       DOUBLE PRECISION,
  min_power       DOUBLE PRECISION,
  max_power       DOUBLE PRECISION,
  elevation_gain  DOUBLE PRECISION,
  elevation_loss  DOUBLE PRECISION,
  UNIQUE(activity_id, segment_index)
);

CREATE INDEX idx_activity_segments_route ON activity_segments USING GIST(route);
CREATE INDEX idx_activity_segments_activity_id ON activity_segments(activity_id);
CREATE INDEX idx_activity_segments_avg_pace ON activity_segments(avg_pace);
CREATE INDEX idx_activity_segments_avg_heartrate ON activity_segments(avg_heartrate);
```

**Decision: 500m fixed segments with min/max/avg metrics.**
500m gives roughly 2x the granularity of per-km. For a 10km run, that's 20 segments — enough spatial resolution for meaningful queries without excessive row counts (~40,000 rows for 2,000 activities). Min/max values per segment enable accurate range queries (e.g., "segments where max HR exceeded 180" vs. "segments where average HR exceeded 180" are different questions).

Segments are derived data — computed from the full streams during the `activity-streams` job (after stream data is stored). They can be recomputed at any time if the segmentation logic changes, since the source JSONB streams are retained.

**Segment computation** is added as a final step in the `activity-streams` job:
1. Fetch `latlng`, `time`, `distance`, `heartrate`, `cadence`, `watts`, `altitude` streams
2. Walk the distance stream, cutting at every 500m boundary
3. For each segment: build a LINESTRING from the latlng points, compute min/max/avg for each metric
4. Upsert all segments for the activity
5. Build the full-route LINESTRING and store on `activities.route`
6. Set `sync_status = 'complete'`

---

## 3. Webhook Handling

### Subscription Setup

Strava webhooks require a callback URL that passes a validation challenge. Two endpoints:

**`GET /api/webhooks/strava`** — Subscription validation
- Strava sends `hub.mode`, `hub.challenge`, `hub.verify_token`
- Verify token matches `STRAVA_WEBHOOK_VERIFY_TOKEN` env var
- Respond with `{ "hub.challenge": "<value>" }` within 2 seconds

**`POST /api/webhooks/strava`** — Event receiver
- Payload: `{ object_type, aspect_type, object_id, owner_id, subscription_id, event_time, updates }`
- Respond 200 immediately (Strava requires response within 2 seconds)
- Enqueue a job for async processing — never do Strava API calls in the webhook handler

### Event Processing

| Event | Action |
|---|---|
| `activity:create` | Enqueue single activity import job |
| `activity:update` | Enqueue single activity import job (upsert handles changes) |
| `activity:delete` | Delete activity + cascaded laps/streams from DB |
| `athlete:update` with `authorized: false` | Deauthorize user — delete tokens, optionally delete data |

**Decision: No webhook signature verification.**
Strava webhooks don't include an HMAC signature. The only protection is the verify_token during subscription creation and the subscription_id in payloads. Validate `subscription_id` matches the expected value and reject unknown subscriptions.

### Webhook Subscription Management

A CLI command (`make webhook:subscribe`) to create/verify the webhook subscription. Requires the app's public URL, so it's a deployment-time operation, not something that runs automatically.

```
make webhook:subscribe URL=https://app.example.com/api/webhooks/strava
make webhook:list
make webhook:delete
```

---

## 4. BullMQ Job Architecture

### Queue Structure

Single queue named `strava` with job-level priority. Multiple queues would complicate rate limiting since all jobs share the same Strava rate limit pool.

### Job Types

```typescript
type StravaJob =
  | { type: 'full-history-import'; userId: number }
  | { type: 'activity-import'; userId: number; activityId: number }
  | { type: 'activity-streams'; userId: number; activityId: number }
  | { type: 'webhook-event'; event: StravaWebhookEvent }
```

### Job Flow

**Full history import** (`full-history-import`):
1. Paginate through `GET /athlete/activities` (200 per page, newest first)
2. Upsert each activity summary into `activities` table with `sync_status = 'pending'`
3. For each activity, enqueue an `activity-import` child job
4. Track progress via job data (current page, total discovered)

In development, respect a `SYNC_AFTER` env var (epoch timestamp) to limit the import window. Default to ~30 days ago when set to `dev`. Avoids burning through rate limits during development.

**Single activity import** (`activity-import`):
1. Fetch `GET /activities/{id}` (detail + laps)
2. Upsert activity detail into `activities` table
3. Upsert laps into `activity_laps` table
4. Set `sync_status = 'streams_pending'`
5. Enqueue `activity-streams` child job

**Stream import** (`activity-streams`):
1. Fetch `GET /activities/{id}/streams?keys=time,distance,heartrate,...`
2. Upsert each stream type into `activity_streams` table
3. Compute and upsert 500m segments into `activity_segments` table
4. Build full-route LINESTRING and store on `activities.route`
5. Set `sync_status = 'complete'`

**Webhook event** (`webhook-event`):
1. Parse event type
2. For `activity:create` / `activity:update`: enqueue `activity-import` job
3. For `activity:delete`: delete directly from DB (no Strava API call needed)
4. For `athlete:update` with deauth: handle token revocation

### Priority

| Job Type | Priority | Rationale |
|---|---|---|
| `webhook-event` | 1 (highest) | Real-time sync, user expectation of immediacy |
| `activity-import` | 5 | Individual activity detail |
| `activity-streams` | 5 | Stream data for an activity |
| `full-history-import` | 10 (lowest) | Background bulk operation |

### Rate Limiting

Strava enforces two limits:
- **200 requests per 15 minutes** (short-term)
- **2,000 requests per day** (long-term)

Rate limit headers returned on every response:
- `X-RateLimit-Limit`: `200,2000`
- `X-RateLimit-Usage`: `current_15min,current_daily`

**Approach: Token bucket tracked in Redis.**

```
strava:ratelimit:15min  — counter, TTL 15 minutes
strava:ratelimit:daily  — counter, TTL until midnight UTC
```

Before each Strava API call, the worker checks the counters. If either limit is near (within a safety margin of ~10 requests), the job is delayed:
- 15-min limit hit: delay until the current 15-min window expires
- Daily limit hit: delay until midnight UTC

This is implemented as a BullMQ rate limiter wrapper in the worker, not in the Strava client. The worker controls concurrency (single concurrent processor for Strava jobs) and inspects rate limit headers after each response to update the Redis counters with Strava's authoritative values.

**Decision: Single concurrency for the Strava queue.**
Running multiple concurrent Strava API requests risks burning through rate limits unpredictably and complicates counter tracking. Sequential processing with a single worker is simpler and provides predictable throughput (~13 req/min sustained).

### Retry Strategy

- **Retries:** 3 attempts with exponential backoff (30s, 2min, 10min)
- **429 responses:** Delay job until the rate limit window resets (read from response headers), do not count as a retry
- **401 responses:** Attempt token refresh, then retry. If refresh fails, mark job as failed.
- **5xx responses:** Standard retry with backoff
- **Final failure:** Set `sync_status = 'failed'` on the activity. Failed activities are visible in the admin panel (Phase 3b) for manual re-queue.

---

## 5. Sync Strategy

### Initial Import

Triggered manually by the user (button in the UI or admin action). The `full-history-import` job paginates backwards through all activities.

**Pagination approach:** Use `before` parameter with the `start_date` of the oldest activity fetched so far. This is more reliable than page numbers if activities are created/deleted during import.

**Estimated API cost for a typical runner:**
- ~500 activities = 1 list page call per ~6 activities detail = ~500 detail calls + ~500 stream calls ≈ 1,000 API calls
- At 200 req/15min: ~75 minutes for full import
- Larger history (2,000+ activities): multiple hours, spread across daily limits

### Ongoing Sync

Webhooks handle new/updated/deleted activities in near-real-time. Each webhook event enqueues a single `activity-import` job (1-3 API calls per activity).

### Resumability

Import jobs are idempotent — all writes use `ON CONFLICT DO UPDATE`. If the worker crashes mid-import:
- Activities already imported retain their data
- The `full-history-import` job can be re-enqueued and will re-paginate, but upserts mean no duplicate data
- Activities with `sync_status = 'pending'` or `'streams_pending'` can be identified and re-queued via admin tooling

### Idempotent Upserts

All database writes use Drizzle's `onConflictDoUpdate`:

```typescript
await db.insert(activities)
  .values(activityData)
  .onConflictDoUpdate({
    target: [activities.source, activities.externalId],
    set: {
      name: activityData.name,
      distance: activityData.distance,
      // ... all mutable fields
      syncStatus: 'streams_pending',
      updatedAt: new Date(),
    },
  });
```

---

## 6. Webhook Simulation

A CLI command for local development and testing:

```
make webhook:simulate EVENT=activity:create ACTIVITY_ID=12345 OWNER_ID=67890
```

Posts a synthetic webhook payload to the local webhook endpoint. Useful for testing the full pipeline without waiting for real Strava events.

Implemented as a simple script in `scripts/simulate-webhook.ts` that constructs the payload and `fetch`es the local endpoint.

---

## 7. Seed Data

After the first successful full import, generate a development seed:

```
make seed:dump    # pg_dump --data-only filtered to activity tables
make seed:restore # Restore seed data to a fresh DB
```

The seed dump is stored in `scripts/seed.sql.gz` (gitignored — contains personal activity data). The dump includes users, oauth_accounts (with redacted tokens), activities, activity_laps, and activity_streams.

---

## 8. File Structure

```
packages/strava/src/
  index.ts              # Public exports
  client.ts             # StravaClient HTTP wrapper
  types.ts              # API response types
  errors.ts             # Error classes
  tokens.ts             # Token refresh logic (moved from web app)
  mapping.ts            # Strava -> app type mappings (sport type, workout type)

packages/shared/src/
  activity-types.ts     # App-level SportType, WorkoutType enums

packages/db/src/schema/
  activities.ts         # activities table
  activity-laps.ts      # activity_laps table
  activity-streams.ts   # activity_streams table
  activity-segments.ts  # activity_segments table (500m segments with PostGIS)
  index.ts              # Re-export all schemas

apps/worker/src/
  index.ts              # Worker entrypoint, queue setup
  jobs/
    full-history-import.ts
    activity-import.ts
    activity-streams.ts
    webhook-event.ts
  rate-limiter.ts       # Redis-backed rate limit tracker
  processor.ts          # Job router (dispatches by job type)

apps/web/src/routes/
  api/webhooks/strava/
    +server.ts          # GET (validation) + POST (event receiver)

scripts/
  simulate-webhook.ts   # Webhook simulation CLI
```

---

## 9. Testing Strategy

> *Added after local-review flagged that the project's CLAUDE.md requires tests for all changes, and no testing plan was originally included in this doc.*

### Strava API Client (`packages/strava`)

Unit tests with mocked HTTP responses. The client is a stateless HTTP wrapper, so tests verify:
- Correct URL construction and query params for each endpoint
- Response parsing into typed objects
- Error handling (4xx, 5xx, malformed responses)
- Token refresh logic (expired token triggers refresh, failed refresh propagates error)

Use `msw` (Mock Service Worker) or simple fetch mocks to avoid real API calls.

### Database Schema & Upserts

Integration tests against a real Postgres instance (already available in CI via Docker). Verify:
- Activity upsert creates on first insert, updates on conflict (via `source, external_id`)
- Lap upsert with `(activity_id, lap_index)` uniqueness
- Stream upsert with `(activity_id, stream_type)` composite PK
- Segment upsert with `(activity_id, segment_index)` uniqueness
- Cascade deletes (deleting an activity removes its laps, streams, and segments)
- `sync_status` transitions (`pending` -> `streams_pending` -> `complete`)
- PostGIS geometry storage and spatial index queries on `activities.route` and `activity_segments.route`

### Job Handlers (`apps/worker`)

Unit tests for each job handler with mocked Strava client and DB. Verify:
- `full-history-import`: paginates correctly, enqueues child jobs for each activity
- `activity-import`: fetches detail + laps, upserts, transitions sync status, enqueues stream job
- `activity-streams`: fetches streams, upserts, computes segments + route geometry, sets `complete`
- `webhook-event`: routes to correct action by event type, handles `delete` and `deauth`

### Segment Computation

Unit tests for the 500m segmentation logic:
- Correctly splits stream data at 500m distance boundaries
- Computes min/max/avg for pace, HR, cadence, power per segment
- Builds valid LINESTRING geometries from latlng points
- Handles edge cases: activities shorter than 500m, missing metrics (no HR, no power), activities without GPS data

### Rate Limiter

Unit tests for the Redis-backed rate limiter. Verify:
- Counter increments and TTL behavior
- Safety margin triggers delay
- Authoritative header values overwrite local counters
- Daily reset at midnight UTC

### Webhook Endpoint

Integration test for the SvelteKit route handlers:
- GET validation: echoes `hub.challenge` when `verify_token` matches, rejects mismatches
- POST event: returns 200 immediately, enqueues job (verify job was added to queue)
- POST with unknown `subscription_id`: rejected

---

## 10. Resolved Questions

- **PostGIS for GPS tracks:** Yes. Full route geometry on `activities.route` for activity-level spatial queries. 500m segments in `activity_segments` with min/max/avg metrics for sub-activity spatial + performance queries. Both computed at import time from stream data.
- **Stream data storage:** Keep in Postgres as JSONB. ~200MB effective for 2,000 activities after TOAST compression. Single backup, transactional writes, no second storage system. Revisit only if dataset grows significantly.
- **Dev server webhooks:** Skip. Use `make webhook:simulate` for local development. Real webhook testing on the deployed server. Avoids tunnel hassle, URL churn, and wasted API quota.
- **Multi-user rate limiting:** Single API credentials, single rate limit pool. No per-user rate limiting needed.
- **Backfill strategy:** Re-import from `source_raw` JSONB rather than re-fetching from the API. Avoids rate limit pressure. Only works for fields present in the original response.
- **Activity deletion:** Hard delete. Cascade removes laps, streams, and segments. Simpler and respects user intent.

---

## 11. Dependencies & Prerequisites

- Phase 2 complete (OAuth tokens available)
- `packages/strava` skeleton exists (just a placeholder comment)
- `apps/worker` scaffold exists (BullMQ connected, no real job processing)
- Redis and Postgres running via Docker Compose
- Strava OAuth scopes already include `activity:read_all` (set in Phase 2)

---

## Changes From Review Feedback

The following changes were made after `/local-review` reviewed this document:

- **Added section 9 (Testing Strategy):** The original document had no testing plan. The review flagged a CLAUDE.md violation ("Write adequate tests to cover changes") against the broader changeset, which highlighted that this implementation doc omitted testing entirely. Added coverage plans for the Strava client (unit tests with mocked HTTP), database upserts (integration tests against Postgres), job handlers (unit tests with mocked dependencies), rate limiter (unit tests), and webhook endpoints (integration tests).
