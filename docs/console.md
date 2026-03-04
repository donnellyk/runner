# Console

Start with `mise run console` (local) or `mise run console:prod` (production via SSH tunnel).

Available globals: `db`, `redis`, `strava`, `queue`, `schema`

Drizzle helpers need to be imported:

```js
const { eq, and, desc, sql, count } = require('drizzle-orm')
```

## Database Queries

```js
// All users
await db.select().from(schema.users)

// Find a user
const [user] = await db.select().from(schema.users).where(eq(schema.users.id, 1))

// Admins
await db.select().from(schema.users).where(eq(schema.users.isAdmin, true))

// Recent activities
await db.select().from(schema.activities).orderBy(desc(schema.activities.startDate)).limit(10)

// Activities by status
await db.select().from(schema.activities).where(eq(schema.activities.syncStatus, 'failed'))

// Count by status
await db.select({ status: schema.activities.syncStatus, count: sql`count(*)` })
  .from(schema.activities).groupBy(schema.activities.syncStatus)

// User's OAuth token
const [oauth] = await db.select().from(schema.oauthAccounts)
  .where(and(eq(schema.oauthAccounts.userId, 1), eq(schema.oauthAccounts.provider, 'strava')))

// Activity laps
await db.select().from(schema.activityLaps).where(eq(schema.activityLaps.activityId, 123))

// Activity streams
await db.select({ type: schema.activityStreams.streamType })
  .from(schema.activityStreams).where(eq(schema.activityStreams.activityId, 123))
```

## Mutations

```js
// Promote user to admin
await db.update(schema.users).set({ isAdmin: true }).where(eq(schema.users.id, 1))

// Reset failed activities to pending
await db.update(schema.activities).set({ syncStatus: 'pending', updatedAt: new Date() })
  .where(eq(schema.activities.syncStatus, 'failed'))

// Delete a session
await db.delete(schema.sessions).where(eq(schema.sessions.userId, 1))
```

## Queue

```js
// View queue stats
await queue.getJobCounts()

// Queue an activity import
await queue.add('activity-import', { type: 'activity-import', userId: 1, activityId: 12345 }, { priority: 5 })

// Queue a full history import
await queue.add('full-history-import', { type: 'full-history-import', userId: 1 }, { priority: 10 })

// Queue history import for activities after a date
await queue.add('full-history-import', { type: 'full-history-import', userId: 1, after: Math.floor(new Date('2025-01-01').getTime() / 1000) }, { priority: 10 })

// View failed jobs
await queue.getFailed()

// Retry all failed jobs
const failed = await queue.getFailed()
for (const job of failed) await job.retry()

// Drain the queue (remove all jobs)
await queue.drain()
```

## Strava API

```js
// Get a valid token (auto-refreshes if expired)
const token = await strava.getValidToken(db, 1)

// List recent activities
const { data, rateLimit } = await strava.listActivities(token)

// Get a specific activity
const { data: activity } = await strava.getActivity(token, 12345)

// Get activity streams
const { data: streams } = await strava.getActivityStreams(token, 12345, ['heartrate', 'latlng', 'altitude'])

// Get laps
const { data: laps } = await strava.getActivityLaps(token, 12345)

// Check rate limit status
rateLimit  // { limit15min, usage15min, limitDaily, usageDaily }
```

## Redis

```js
// Check rate limit keys
await redis.get('strava:ratelimit:15min')
await redis.get('strava:ratelimit:daily')

// List all keys matching a pattern
const keys = await redis.keys('bull:*')

// Flush (careful!)
await redis.flushdb()
```

## Tables Reference

| Table | Key Columns |
|-------|-------------|
| `users` | id, stravaAthleteId, firstName, lastName, isAdmin |
| `activities` | id, externalId, userId, sportType, syncStatus, startDate |
| `oauthAccounts` | id, userId, provider, accessToken, refreshToken, expiresAt |
| `sessions` | id, userId, expiresAt |
| `activityLaps` | id, activityId, lapIndex, distance, movingTime |
| `activityStreams` | activityId, streamType, data |
| `activitySegments` | id, activityId, segmentIndex, avgPace, avgHeartrate |
