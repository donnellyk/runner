# Architecture Decisions

## Tech Stack

### Frontend & Backend: SvelteKit (TypeScript)
SvelteKit serves as both the frontend framework and backend API layer. It provides server-side rendering, API routes, and a unified TypeScript codebase. No separate backend service is needed initially.

### CSS: Tailwind CSS
Utility-first CSS framework. Installed via the SvelteKit integration (`@tailwindcss/vite`). See: https://tailwindcss.com/docs/installation/framework-guides/sveltekit

### Database: Postgres + PostGIS
- **Postgres** as the primary data store
- **PostGIS** extension for geospatial data (GPS traces, route data)
- Activity stream data stored in a standard Postgres table with a composite primary key `(activity_id, timestamp)` — no hypertables or extensions needed at current scale (~5-15M rows for a single user)
- **TimescaleDB migration path:** The composite key makes the schema TimescaleDB-compatible. After the streams table schema stabilizes (end of Phase 3), it can be converted to a hypertable with a two-line migration if needed. No application code changes required.

### ORM: Drizzle
Chosen for its SQL-like query syntax that stays close to raw SQL while providing TypeScript type safety. Drizzle will manage the schema and all queries. If TimescaleDB is adopted later, hypertable creation and compression policies would be handled via raw SQL in migrations.

### Job Queue: Redis + BullMQ
- **Redis** for job queue backing store, with potential for session caching and general caching later
- **BullMQ** for job processing — provides rate limiting (critical for Strava API), delayed/scheduled jobs, job priorities, progress tracking, and retry with backoff. All TypeScript-native.

### Auth: Lucia (Session-based)
- Session-based auth using Lucia, which integrates natively with SvelteKit
- Sessions stored in Postgres
- "Sign in with Strava" via OAuth as the initial login method (using Arctic, Lucia's OAuth companion library)
- Strava OAuth tokens (access + refresh) stored alongside the user record for API access
- JWTs deferred to a later phase when a mobile client / external API consumers require them

### Package Manager: pnpm (workspaces)
pnpm workspaces for monorepo dependency management. No additional build orchestration tooling (e.g., Turborepo) to start.

---

## Service Architecture

Four services, all managed via Docker Compose:

1. **SvelteKit App** (`apps/web`) — frontend, API routes, auth
2. **Worker** (`apps/worker`) — BullMQ consumer for Strava import/sync, webhook processing, background computation
3. **Postgres** — primary data store (with PostGIS extension)
4. **Redis** — job queue (BullMQ), potential cache layer

### Horizontal Scaling
The architecture is designed so that scaling horizontally requires only a load balancer and additional app/worker nodes:
- SvelteKit app nodes are **stateless** — sessions live in Postgres, not in-memory
- Worker nodes consume from a shared Redis-backed queue
- No local file storage or in-memory state on any app node

---

## Monorepo Structure

```
web-runner/
  apps/
    web/              # SvelteKit app (frontend + API + auth)
    worker/           # BullMQ consumer (Strava sync, background jobs)
  packages/
    db/               # Drizzle schema, migrations, shared queries
    strava/           # Strava API client, types
    shared/           # Shared types, constants, utils
  docker-compose.yml
  package.json        # pnpm workspace root
```

Shared packages (`db`, `strava`, `shared`) are imported by both `apps/web` and `apps/worker` to avoid duplication of schemas, types, and API client logic.

---

## Testing

### Framework: Vitest

### Strategy
High coverage, primarily unit tests with integration tests for database and API layers. E2E tests are not a priority.

### Architecture for Testability
- **Business logic lives in packages, not glue code.** Zone matching, activity scoring, plan anchoring, workout matching — all pure functions in `packages/shared` or `packages/strava`. Unit tested with no dependencies.
- **SvelteKit route handlers are thin.** They validate input, call a service function, and return a response. The service function is the testable unit.
- **Worker job handlers are thin.** BullMQ job processors delegate to testable logic functions. Queue plumbing is separate from business logic — test the logic directly, mock the queue.
- **Database queries are wrapped.** Thin query functions in `packages/db` that can be integration tested against a real Postgres instance (Docker Compose locally, GitHub Actions service containers in CI).
- **Liberal use of mocks and test fixtures.** Strava API client, Redis, and external dependencies are mocked at clear boundaries for unit tests.

---

## Data Pipeline: Strava Integration

### Authentication Flow
- OAuth2 with Strava — user authorizes the app, we store access + refresh tokens
- Token refresh handled automatically when access token expires

### Historical Import
- Paginate `/athlete/activities` to collect all activity IDs (~200 per page, cheap)
- Fetch detail + streams for each activity (~2 API calls per activity)
- Processed via BullMQ with rate limiting to stay within Strava's limits (200 req/15min, 2,000 req/day)
- Estimated ~2 days for a full backfill of ~1,825 activities

### Ongoing Sync
- Strava webhooks for new/updated activities
- Webhook events enqueued in BullMQ, processed by worker
- Webhook-triggered jobs prioritized above background import jobs

### Idempotent Imports
All writes to `activities`, `activity_laps`, and `activity_streams` use upserts (`ON CONFLICT DO UPDATE`). The `activities` table includes a `sync_status` enum (`pending | streams_pending | complete | failed`) that tracks import progress per activity. This makes the pipeline resumable after crashes, network failures, or Strava API errors without manual cleanup. Re-importing an activity (e.g., after a Strava edit) is safe by default.

### Future: FIT File Upload
Manual upload of FIT/GPX/TCX files as a secondary import path, covering Garmin bulk exports, Coros exports, or any other device. Deferred to a later phase.

---

## Data Model (High Level)

### `activities` table (standard Postgres)
One row per activity. Key fields:
- Strava activity ID, athlete ID
- `sport_type` — granular type (Run, TrailRun, VirtualRun, etc.)
- `workout_type` — **first-class field**: 0 = default, 1 = race, 2 = long run, 3 = workout
- Summary stats: distance, duration, elevation, avg/max HR, avg pace, calories
- Strava computed fields: suffer score, average GAP
- Gear (shoes)
- Timestamps

### `activity_laps` table (standard Postgres)
Per-lap/split data: pace, HR, elevation, distance, duration.

### `activity_streams` table (standard Postgres)
One row per data point per activity, at ~1 second resolution. Primary key: `(activity_id, timestamp)`.

Columns:
- `activity_id`, `timestamp`, `distance`
- `heartrate`, `cadence`, `altitude`, `velocity`, `grade`
- `lat`, `lng`

At ~5-15M rows for a single user, the composite primary key index is sufficient for all query patterns (scoped to one or a few activities). The schema is designed to be TimescaleDB-compatible — conversion to a hypertable is a two-line migration if cross-activity aggregation at scale ever requires it.

---

## API Design

The SvelteKit app serves both the web frontend (SSR) and a REST API. There is no separate API service — SvelteKit API routes handle both.

### Conventions
- RESTful resource patterns: `GET /api/activities`, `GET /api/activities/:id`, etc.
- Consistent error response shape across all endpoints
- Cursor-based pagination for list endpoints (better than offset-based for time-series data)
- Every feature is built API-first — SvelteKit pages consume the same API routes that external clients will use

### Auth by client type
- **Web app**: Lucia session cookies
- **Mobile / external clients (future)**: JWT-based auth, added when needed

---

## Local Development

### Seed Data
After the first successful Strava import (Phase 3), a `pg_dump` snapshot is taken and stored as the dev seed dataset. New dev environments restore this dump to populate the database with real, representative data without hitting the Strava API.

FIT/GPX/TCX file parsing is deferred to when it becomes a user-facing feature (not a dev tooling prerequisite).

### Webhook Simulation
A CLI command or dev UI button that injects fake webhook events into the BullMQ queue, triggering the worker's import pipeline locally without a real Strava connection.

### Environment
`docker compose up` starts Postgres, Redis, the SvelteKit app, and the worker. Everything works fully offline.

No mock Strava API server — seed data and webhook simulation cover the development workflow.

---

## Observability

### Phase 1 (at launch)
- **Structured logging** via Pino (JSON to stdout) from both the app and worker
- **Bull Board** — BullMQ's built-in UI, mounted as a route in the app. Provides queue visibility, job status, retry controls.
- **Health check** — `GET /api/health` endpoint that verifies DB and Redis connectivity. Used by Docker Compose restart policies.

### Phase 2 (when the app is functional)
- **Loki** — log aggregation, collects structured JSON logs from containers via Docker log driver
- **Prometheus** — metrics scraping (request rates, queue depth, response latency) via a `/metrics` endpoint
- **Grafana** — dashboard layer for both logs (Loki) and metrics (Prometheus)

All observability services run as containers in the same Docker Compose file. No application code changes needed to add Phase 2 — Pino JSON logs to stdout and a bolt-on `/metrics` endpoint are all that's required.

---

## CI/CD

### CI: GitHub Actions
Runs on every push to main and on PRs (when used):
- TypeScript type checking (`tsc --noEmit`)
- Linting (ESLint)
- Unit tests
- Build verification

Integration tests (requiring Postgres + Redis) run via GitHub Actions service containers.

### Image Build
On push to main (direct or via PR merge), GitHub Actions builds Docker images and pushes them to **GHCR** (GitHub Container Registry). The image build job **depends on the test job passing** — broken code never reaches the registry. This offloads compilation from the NAS.

### Deploy
Manual deploy via `make deploy`:
1. SSHs into the production droplet
2. Pulls pre-built images from GHCR
3. Restarts services via `docker compose pull && docker compose up -d`

No auto-deploy on push. Deploy timing is always under manual control.

---

## Infrastructure

- **Docker Compose** for both local development and production deployment (same Compose file)
- **Local development:** NAS server via Tailscale. Strava webhooks simulated via CLI — no public internet exposure needed.
- **Production:** DigitalOcean droplet with a public IP. Strava webhooks point here directly.
- Deploy orchestrated via Makefile — `make deploy` SSHs into the droplet, pulls images, restarts services.

---

## Backups

- **`pg_dump`** on a cron schedule, pushed to **Backblaze B2**
- `make backup` and `make restore` Makefile targets for manual backup/restore
- Runs on the production droplet; optionally on the NAS for local data
- Set up in Phase 1 alongside the initial infrastructure

---

## Timezone Handling

- IANA timezone string (e.g., `America/New_York`) stored on the user record
- Defaulted from the Strava athlete profile during OAuth, user-overridable in settings
- Used for week boundary calculations in training plan matching, display formatting, and "which week does this activity belong to" logic
- Library choice deferred to implementation time

---

## Data Lifecycle

- **Strava disconnect / OAuth revocation:** Tokens are cleared. Existing imported data is retained (it belongs to the user, not to the Strava connection).
- **Re-import from scratch:** User can trigger a full re-import. Idempotent upserts mean this overwrites existing data cleanly.
- **Account deletion:** All user data (activities, streams, plans, sessions) is permanently deleted.
