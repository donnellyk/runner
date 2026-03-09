# Implementation Plan

## Progress

- [x] Phase 1: Scaffolding
- [x] Phase 2: Auth + Strava OAuth
- [ ] Phase 3: Strava Data Pipeline
- [ ] Phase 3b: Admin Tooling
- [ ] Phase 4a: Activity Views & Charts
- [ ] Phase 4a.1: Activity Notes
- [ ] Phase 4b: Activity Overlay & Comparison
- [ ] Phase 5: Training Plans
- [ ] Phase 6: Workout Scoring
- [ ] Phase 7: Observability Stack

---

## Phase 1: Scaffolding
**Scope: Medium**

Set up the project foundation. No features — just a working, deployable, testable shell.

- Initialize pnpm monorepo with workspace config
- Create `apps/web` (SvelteKit), `apps/worker` (BullMQ consumer), `packages/db`, `packages/strava`, `packages/shared`
- Docker Compose: Postgres (with PostGIS), Redis, app, worker
- Drizzle setup with initial migration infrastructure
- Vitest configured across all packages
- ESLint + TypeScript strict mode
- GitHub Actions: typecheck, lint, test on push; image build to GHCR on main
- Makefile: `dev`, `test`, `build`, `deploy`, `backup`, `restore` targets
- `GET /api/health` endpoint (DB + Redis connectivity check)
- Backup setup: `pg_dump` cron pushing to Backblaze B2

**Exit criteria:** `docker compose up` starts all services, tests run green, CI pipeline passes, `make deploy` works against the droplet, backups are running and restorable.

---

## Phase 2: Auth + Strava OAuth
**Scope: Small-Medium**

Authentication and Strava connection. Required before the data pipeline since OAuth tokens are needed for API access.

- User table in Postgres (includes IANA timezone field, defaulted from Strava profile)
- Lucia session auth integrated with SvelteKit
- "Sign in with Strava" OAuth flow (via Arctic)
- Store Strava access + refresh tokens per user
- Automatic token refresh on expiry
- Protected routes / API middleware
- Auth unit and integration tests

**Exit criteria:** A user can sign in via Strava, maintain a session, and the app holds valid Strava API tokens.

---

## Phase 3: Strava Data Pipeline
**Scope: Medium-Large**

Import and store activity data from Strava. The data foundation everything else builds on.

- Strava API client in `packages/strava` (activities list, activity detail, streams)
- Database schema: `activities`, `activity_laps`, `activity_streams` (standard Postgres, composite PK `(activity_id, timestamp)`)
- `workout_type` and `sport_type` as first-class fields on `activities`
- `sync_status` enum (`pending | streams_pending | complete | failed`) on `activities` for resumable imports
- All writes use upserts (`ON CONFLICT DO UPDATE`) — pipeline is idempotent and crash-safe
- BullMQ job types: full history import, single activity import, webhook event processing
- Rate limiting logic (200 req/15min, 2,000/day) built into the queue
- Webhook receiver endpoint for ongoing sync
- Job priority: webhooks > background import
- Webhook simulation CLI command
- After first successful import: `pg_dump` as the dev seed dataset (committed or stored in a known location)

**Exit criteria:** Full historical import completes successfully, new activities sync via webhook, local dev works fully offline with seed data dump.

---

## Phase 3b: Admin Tooling
**Scope: Small-Medium**

Internal tooling for inspecting data, managing queues, and debugging issues without direct DB or Redis access. Built right after the data pipeline when there's real data flowing and real things to break.

- `is_admin` boolean column on users table; first registered user is automatically admin
- Admin layout shell under `/admin` with sidebar navigation
- **Users** (`/admin/users`): user list with Strava connection status, token expiry, last sync timestamp, account creation date. Toggle admin for other users.
- **Activities** (`/admin/activities`): browse all activities across users, filter by sync status, inspect raw data, re-queue failed imports
- **Queues** (`/admin/queues`): Bull Board integration (moved from Phase 3), manual job creation (trigger full sync, single activity re-import), rate limit quota consumption
- **Strava** (`/admin/strava`): rate limit window usage, daily quota, webhook subscription status and verification
- **System** (`/admin/system`): DB table sizes and row counts, Redis memory and key counts, connection pool stats, last backup timestamp, slow queries via `pg_stat_statements`
- `pg_stat_statements` extension enabled in Postgres config
- `make console`: Node REPL with DB client, Redis client, and Strava API client pre-loaded
- `make studio`: runs `drizzle-kit studio` for schema-aware data browsing during development

**Exit criteria:** An admin can browse users, inspect activity sync state, manage queue jobs, view rate limit status, and drop into a console.

---

## Phase 4a: Activity Views & Charts
**Scope: Medium**

The first user-facing feature. Browse activities and visualize individual efforts.

- Activity list view with filtering (workout type, sport type, distance range, date range)
- Activity detail view with summary stats
- Chart-based visualization: pace, HR, elevation, GAP over distance/time
- User-defined effort zones (pace/HR ranges mapped to zone names: easy, GA, LT, etc.)
- API endpoints for all of the above

**Exit criteria:** A user can browse their activities, view detailed charts for any activity, and define their effort zones.

---

## Phase 4a.1: Activity Notes
**Scope: Small-Medium**

Distance-anchored notes on activities. A note can reference a single point (e.g., "4 km: Took a gel") or a range (e.g., "1 km – 1.5 km: This hill felt harder than expected"). Notes appear as visual indicators on the route map and stream charts, with a toggle to show/hide.

- `activity_notes` table: point or range notes anchored to distance (meters)
- CRUD API endpoints for notes on an activity
- Visual markers on RouteMap (CircleMarker for points, highlighted polyline segment for ranges)
- Visual indicators on ActivityChart (vertical lines/shaded regions at note distances)
- Notes list panel on the activity detail page with inline add/edit/delete
- Toggle to show/hide note indicators on map and charts
- Clicking a note scrolls/highlights the corresponding map and chart indicators
- Tests for note CRUD, distance validation, and display logic

**Exit criteria:** A user can create, edit, and delete distance-anchored notes on an activity. Notes appear as toggleable visual indicators on the map and all stream charts.

---

## Phase 4b: Activity Overlay & Comparison
**Scope: Medium**

Multi-activity comparison — the "Bloomberg Terminal" feature.

- Overlay mode: select two or more activities and chart them on the same axes
- Stream alignment across activities with different lengths, paces, and sampling rates
- X-axis normalization (distance-based and time-based views)
- Synchronized tooltips and crosshairs across overlaid series
- GPS data smoothing for clean chart output
- API endpoints for multi-activity stream retrieval

**Exit criteria:** A user can select two activities and overlay their pace, HR, and elevation charts for direct comparison.

---

## Phase 5: Training Plans
**Scope: Medium-Large**

Training plan management, weekly view, and activity matching.

- YAML plan import with Zod schema validation (defined in `packages/shared`)
- Plan data model: plans, weeks, workouts, targets
- Race day anchoring (set race date, calculate start date, warn if in the past)
- Active plan lifecycle (one active plan, auto-archive after race day)
- Weekly view: current week's workouts with default day assignments
- Drag-and-drop reordering of workouts within a week
- Activity matching: heuristic auto-match (distance, day, workout type) with confidence scoring
- User confirmation/override for matches
- Manual link/unlink of activities to planned workouts
- API endpoints for plan management and matching

**Exit criteria:** A user can import a YAML plan, anchor it to a race date, see their weekly view, and have completed Strava activities automatically matched to planned workouts.

---

## Phase 6: Workout Scoring
**Scope: Medium**

Streams-based analysis of workout compliance against plan targets.

- Pace/HR data smoothing (GPS noise, stops)
- Zone detection: identify sustained segments within a user's defined effort zones
- Target compliance scoring: compare detected segments against planned workout targets
- Distance compliance scoring
- Scoring summary UI on matched workouts
- API endpoints for scoring data

**Exit criteria:** A matched workout with targets (e.g., "20-30min at LT") shows a compliance score based on actual activity stream data.

---

## Phase 7: Observability Stack
**Scope: Small-Medium**

Full monitoring and log aggregation. Deferred until the app is functional and producing meaningful data.

- Loki added to Docker Compose for log aggregation
- Prometheus added for metrics scraping
- `/metrics` endpoint exposing app and worker metrics (request rates, queue depth, job durations)
- Grafana added with pre-configured dashboards for logs and metrics
- Memory limits configured for all observability containers (NAS-friendly)

**Exit criteria:** Grafana dashboards show app logs, request metrics, and queue health.
