# web-runner

A personal running analytics platform that imports Strava data and provides activity visualization, training plan management, and workout scoring. Built as a learning project for a complete web stack.

## Quick Reference

```bash
pnpm run dev          # Start all services (SvelteKit + worker)
pnpm run check        # Full CI: typecheck + lint + test
pnpm run test         # Vitest across all packages
pnpm run typecheck    # tsc --build + svelte-check
pnpm run build        # Build all packages
```

If `tsc --build` fails with TS6305 stale dist errors, run `npx tsc --build --clean && npx tsc --build` first.

## Architecture

### Monorepo (pnpm workspaces)

```
apps/
  web/                 # SvelteKit app — frontend, API routes, auth (SSR)
  worker/              # BullMQ consumer — Strava sync, background jobs
packages/
  db/                  # Drizzle schema, migrations, DB client
  strava/              # Strava API client, types, token refresh
  shared/              # App-level enums (SportType, WorkoutType), queue constants
```

### Services (Docker Compose)

- **SvelteKit** (`apps/web`) — frontend + API + auth
- **Worker** (`apps/worker`) — BullMQ job processor
- **Postgres** (with PostGIS) — primary data store
- **Redis** — job queue (BullMQ), rate limit tracking

### Key Technologies

- **Frontend:** SvelteKit (Svelte 5 with runes), Tailwind CSS v4
- **ORM:** Drizzle (PostgreSQL)
- **Auth:** Session-based (cookies), Strava OAuth via Arctic
- **Queue:** BullMQ + Redis
- **Maps:** Leaflet (lazy-loaded)
- **Charts:** Custom SVG polyline components
- **Testing:** Vitest
- **Linting:** ESLint with svelte plugin

## Data Model

### Core Tables (`packages/db/src/schema/`)

- **users** — Strava athlete ID, name, timezone, `distanceUnit` (metric/imperial), isAdmin
- **sessions** — Session-based auth, stored in Postgres
- **oauth_accounts** — Strava OAuth tokens (access + refresh)
- **activities** — One row per activity. Key fields: distance (meters), movingTime (seconds), averageSpeed (m/s), totalElevationGain (meters), syncStatus (pending/streams_pending/complete/failed), route (PostGIS LINESTRING), sourceRaw (JSONB)
- **activity_laps** — Per-lap data keyed by `(activityId, lapIndex)`
- **activity_streams** — JSONB arrays per stream type per activity: heartrate, altitude, velocity_smooth, cadence, watts, grade_smooth, latlng, time, distance
- **activity_segments** — Pre-computed 500m splits with min/max/avg for pace, HR, cadence, power, elevation. PostGIS route geometry per segment.

### Units Convention

All values stored in metric (meters, seconds, m/s). Display conversion to imperial happens in `apps/web/src/lib/format.ts` based on `user.distanceUnit`.

### Type System

`SessionUser` is `typeof users.$inferSelect` — adding columns to the users schema automatically propagates through `locals.user` and `data.user` in all pages.

## Route Structure

### Auth (public)
- `/auth/login` — Login page
- `/auth/strava` — Initiates Strava OAuth
- `/auth/strava/callback` — OAuth callback, creates session
- `/auth/logout` — POST endpoint, destroys session

### User-facing (protected)
- `/` — Currently a debug/placeholder page showing session info

### Admin (protected, requires isAdmin)
- `/admin/users` — User list with clickable rows
- `/admin/users/[id]` — User profile: info, distance unit toggle (auto-saves), activity list
- `/admin/activities` — Paginated activity list with filters, clickable rows
- `/admin/activities/[id]` — Activity detail: map, stats, laps, stream charts, segments
- `/admin/queues` — BullMQ job management
- `/admin/strava` — Rate limit monitoring, webhook status
- `/admin/system` — DB stats, Redis stats, slow queries

### API
- `GET /api/health` — DB + Redis connectivity check
- `GET/POST /api/webhooks/strava` — Webhook validation + event receiver

## Layout Hierarchy

```
+layout.svelte              — Root: imports app.css, renders children
+layout.server.ts           — Returns locals.user to all pages
(protected)/
  +layout.server.ts         — Redirects to /auth/login if no user
  admin/
    +layout.server.ts       — Redirects to / if not admin
    +layout.svelte          — Sidebar nav + content area
```

## Development Patterns

### Svelte 5 Runes

This project uses Svelte 5. Use runes, not stores:
- `$props()` for component props (not `export let`)
- `$derived()` for reactive derived values (not `$:`)
- `$state()` for reactive state
- `$app/state` for page state (not `$app/stores`)
- Use `$derived()` when capturing values from `data` props that need to stay reactive after `invalidateAll()`

### SvelteKit Conventions

- Form actions with `use:enhance` for progressive enhancement
- `invalidateAll()` after actions that change data used by parent layouts (e.g., user preferences)
- `resolve()` from `$app/paths` for all internal hrefs
- `goto(resolve(...))` for programmatic navigation (eslint enforces `resolve()`)

### Tailwind CSS v4

Imported via `@import "tailwindcss"` in `app.css`. No config file — Tailwind v4 uses CSS-based configuration. Utility classes inline, no component library.

### Clickable Table Rows

Pattern used across admin tables:
```svelte
<tr class="border-b border-zinc-100 cursor-pointer hover:bg-zinc-50"
    onclick={(e) => rowClick(e, item.id)}>
```
With a handler that excludes interactive children:
```ts
function rowClick(event: MouseEvent, id: number) {
  if ((event.target as HTMLElement).closest('button, a, form')) return;
  goto(resolve(`/admin/items/${id}`));
}
```

### Format Utilities (`apps/web/src/lib/format.ts`)

All distance/pace/elevation formatting is centralized and unit-aware. Functions accept raw metric values and a `Units` parameter ('metric' | 'imperial'). Access the user's preference via `data.user.distanceUnit`.

### Database Migrations

```bash
cd packages/db
pnpm run generate    # drizzle-kit generate (creates SQL in drizzle/)
pnpm run migrate:run # tsx src/migrate.ts
```

Migration files are in `packages/db/drizzle/`. Review generated SQL — drizzle-kit can produce duplicate statements if prior migrations had drift (e.g., the is_admin column).

### Testing

- Tests colocated near source or in `__tests__/` directories
- Vitest workspace: each package has its own `vitest.config.ts`
- `apps/web` uses `$lib` alias in vitest via `alias` config
- Pure function tests (like format.ts) don't need SvelteKit — they run with basic vitest

## Implementation Phases

See `docs/implementation-plan.md` for the full roadmap:
- Phase 1-2: Complete (scaffolding, auth)
- Phase 3: Complete (Strava data pipeline)
- Phase 3b: Complete (admin tooling)
- **Phase 4a: Next** (user-facing activity views & charts)
- Phase 4b: Activity overlay & comparison
- Phase 5: Training plans
- Phase 6: Workout scoring
- Phase 7: Observability

Detailed implementation docs in `docs/phase-3-implementation.md` and `docs/phase-3b-implementation.md`.

## Infrastructure

- **Local dev:** Docker Compose (Postgres + Redis + app + worker)
- **Production:** DigitalOcean droplet, accessed via Tailscale
- **CI:** GitHub Actions — typecheck, lint, test, image build to GHCR
- **Deploy:** Manual via Makefile, pulls pre-built images
- **Backups:** pg_dump to Backblaze B2 on cron

## Scripts (`scripts/`)

- `admin-promote.ts` — Promote a user to admin
- `bull-board.ts` — Standalone Bull Board queue dashboard (port 3001)
- `console.ts` — Node REPL with DB, Redis, Strava, queue pre-loaded
- `simulate-webhook.ts` — Inject fake webhook events for testing
- `webhook-manage.ts` — Manage Strava webhook subscriptions
- `wipe-activities.ts` — Delete all activity data
- `backup.sh` / `restore.sh` — Database backup/restore
