# Implementation Plan

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
- Bull Board mounted in the app for queue visibility

**Exit criteria:** Full historical import completes successfully, new activities sync via webhook, local dev works fully offline with seed data dump.

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
