import type { Job, Queue } from 'bullmq';
import type { Logger } from 'pino';
import { eq, and, sql } from 'drizzle-orm';
import type { Database } from '@web-runner/db/client';
import { activities, activityStreams, activitySegments } from '@web-runner/db/schema';
import { StravaClient, getValidToken, STREAM_KEYS } from '@web-runner/strava';
import type { PlanMatchJobData } from '@web-runner/shared';
import type { StravaRateLimiter } from '../rate-limiter.js';
import { computeSegments, buildRouteWkt } from '../segments.js';
import { checkRateLimit } from '../rate-limit-guard.js';

interface ActivityStreamsData {
  type: 'activity-streams';
  userId: number;
  activityId: number;
}

export async function handleActivityStreams(
  job: Job<ActivityStreamsData>,
  deps: { db: Database; planQueue: Queue; rateLimiter: StravaRateLimiter; logger: Logger; token?: string },
) {
  const { db, rateLimiter, logger } = deps;
  const { userId, activityId } = job.data;

  const token = await getValidToken(db, userId);
  if (!token) throw new Error(`No valid token for user ${userId}`);

  const [activity] = await db.select({ id: activities.id })
    .from(activities)
    .where(and(
      eq(activities.source, 'strava'),
      eq(activities.externalId, String(activityId)),
    ));

  if (!activity) throw new Error(`Activity not found: strava/${activityId}`);
  const actDbId = activity.id;

  const client = new StravaClient();

  await checkRateLimit(rateLimiter, job, deps.token);
  const { data: streamSet, rateLimit } = await client.getActivityStreams(
    token,
    activityId,
    [...STREAM_KEYS],
  );
  await rateLimiter.updateFromHeaders(rateLimit.usage);

  const streamMap: Record<string, unknown[]> = {};
  for (const stream of streamSet) {
    streamMap[stream.type] = stream.data;
  }

  const segments = computeSegments({
    distance: streamMap.distance as number[] | undefined,
    time: streamMap.time as number[] | undefined,
    latlng: streamMap.latlng as [number, number][] | undefined,
    heartrate: streamMap.heartrate as number[] | undefined,
    cadence: streamMap.cadence as number[] | undefined,
    watts: streamMap.watts as number[] | undefined,
    altitude: streamMap.altitude as number[] | undefined,
    velocity_smooth: streamMap.velocity_smooth as number[] | undefined,
  });

  const latlng = streamMap.latlng as [number, number][] | undefined;
  const routeWkt = latlng ? buildRouteWkt(latlng) : null;

  await db.transaction(async (tx) => {
    for (const stream of streamSet) {
      await tx.insert(activityStreams).values({
        activityId: actDbId,
        streamType: stream.type,
        data: stream.data,
        originalSize: stream.original_size,
        resolution: stream.resolution,
      }).onConflictDoUpdate({
        target: [activityStreams.activityId, activityStreams.streamType],
        set: {
          data: stream.data,
          originalSize: stream.original_size,
          resolution: stream.resolution,
        },
      });
    }

    for (const seg of segments) {
      await tx.insert(activitySegments).values({
        activityId: actDbId,
        segmentIndex: seg.segmentIndex,
        route: seg.routeWkt ? sql`ST_GeomFromEWKT(${seg.routeWkt})` : null,
        distanceStart: seg.distanceStart,
        distanceEnd: seg.distanceEnd,
        duration: seg.duration,
        avgPace: seg.avgPace,
        minPace: seg.minPace,
        maxPace: seg.maxPace,
        avgHeartrate: seg.avgHeartrate,
        minHeartrate: seg.minHeartrate,
        maxHeartrate: seg.maxHeartrate,
        avgCadence: seg.avgCadence,
        minCadence: seg.minCadence,
        maxCadence: seg.maxCadence,
        avgPower: seg.avgPower,
        minPower: seg.minPower,
        maxPower: seg.maxPower,
        elevationGain: seg.elevationGain,
        elevationLoss: seg.elevationLoss,
      }).onConflictDoUpdate({
        target: [activitySegments.activityId, activitySegments.segmentIndex],
        set: {
          route: seg.routeWkt ? sql`ST_GeomFromEWKT(${seg.routeWkt})` : null,
          distanceStart: seg.distanceStart,
          distanceEnd: seg.distanceEnd,
          duration: seg.duration,
          avgPace: seg.avgPace,
          minPace: seg.minPace,
          maxPace: seg.maxPace,
          avgHeartrate: seg.avgHeartrate,
          minHeartrate: seg.minHeartrate,
          maxHeartrate: seg.maxHeartrate,
          avgCadence: seg.avgCadence,
          minCadence: seg.minCadence,
          maxCadence: seg.maxCadence,
          avgPower: seg.avgPower,
          minPower: seg.minPower,
          maxPower: seg.maxPower,
          elevationGain: seg.elevationGain,
          elevationLoss: seg.elevationLoss,
        },
      });
    }

    await tx.update(activities)
      .set({
        route: routeWkt ? sql`ST_GeomFromEWKT(${routeWkt})` : null,
        syncStatus: 'complete',
        updatedAt: new Date(),
      })
      .where(eq(activities.id, actDbId));
  });

  logger.info({ userId, activityId, actDbId, segments: segments.length }, 'Streams imported');

  // Enqueue plan-match job so the activity can be matched to a training plan workout
  const planMatchData: PlanMatchJobData = {
    type: 'plan-match',
    userId,
    activityId: actDbId,
  };
  await deps.planQueue.add('plan-match', planMatchData);
}
