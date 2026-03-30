import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { activities } from '@web-runner/db/schema';
import { getUserPRs } from '$lib/server/queries/pr-queries';
import type { PageServerLoad } from './$types';

const MIN_ACTIVITIES = 5;

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = locals.user!.id;
	const db = getDb();

	const period = url.searchParams.get('period') || 'month';
	const sport = url.searchParams.get('sport') || 'run';

	const sportTypes = await db
		.selectDistinct({ sportType: activities.sportType })
		.from(activities)
		.where(eq(activities.userId, userId));

	const periodExpr = period === 'year'
		? sql`extract(year from ${activities.startDate})`
		: sql`to_char(${activities.startDate}, 'YYYY-MM')`;

	const periodLabel = period === 'year'
		? sql<string>`extract(year from ${activities.startDate})::text`
		: sql<string>`to_char(${activities.startDate}, 'YYYY-MM')`;

	const hrFilter = sql`${activities.averageHeartrate} > 0`;
	const cadFilter = sql`${activities.averageCadence} > 0`;

	const rows = await db
		.select({
			period: periodLabel,
			count: sql<number>`count(*)`,

			// Totals
			totalDistance: sql<number>`coalesce(sum(${activities.distance}), 0)`,
			totalMovingTime: sql<number>`coalesce(sum(${activities.movingTime}), 0)`,
			totalElevationGain: sql<number>`coalesce(sum(${activities.totalElevationGain}), 0)`,

			// Averages
			avgDistance: sql<number>`coalesce(avg(${activities.distance}), 0)`,
			avgSpeed: sql<number>`coalesce(avg(${activities.averageSpeed}), 0)`,
			avgHeartrate: sql<number>`coalesce(avg(${activities.averageHeartrate}) filter (where ${hrFilter}), 0)`,
			avgCadence: sql<number>`coalesce(avg(${activities.averageCadence}) filter (where ${cadFilter}), 0)`,

			// Medians (50th percentile)
			medianDistance: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${activities.distance}), 0)`,
			medianSpeed: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${activities.averageSpeed}), 0)`,
			medianHeartrate: sql<number>`coalesce((percentile_cont(0.5) within group (order by ${activities.averageHeartrate}) filter (where ${hrFilter})), 0)`,

			// Max
			maxDistance: sql<number>`coalesce(max(${activities.distance}), 0)`,
			maxSpeed: sql<number>`coalesce(max(${activities.averageSpeed}), 0)`,
			maxHeartrate: sql<number>`coalesce(max(${activities.averageHeartrate}), 0)`,

			// Min (useful for pace — min speed = slowest)
			minSpeed: sql<number>`coalesce(min(${activities.averageSpeed}) filter (where ${activities.averageSpeed} > 0), 0)`,

			// P25 / P75
			p25Speed: sql<number>`coalesce(percentile_cont(0.25) within group (order by ${activities.averageSpeed}), 0)`,
			p75Speed: sql<number>`coalesce(percentile_cont(0.75) within group (order by ${activities.averageSpeed}), 0)`,
			p25Distance: sql<number>`coalesce(percentile_cont(0.25) within group (order by ${activities.distance}), 0)`,
			p75Distance: sql<number>`coalesce(percentile_cont(0.75) within group (order by ${activities.distance}), 0)`,
		})
		.from(activities)
		.where(and(
			eq(activities.userId, userId),
			eq(activities.sportType, sport),
			sql`${activities.distance} > 0`,
		))
		.groupBy(periodExpr)
		.orderBy(sql`${periodExpr} ASC`);

	const numify = (r: Record<string, unknown>) => {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(r)) {
			out[k] = k === 'period' ? v : Number(v);
		}
		return out;
	};

	// Filter out periods with fewer than MIN_ACTIVITIES (for year view)
	const filtered = rows
		.map((r) => numify(r) as Record<string, number> & { period: string })
		.filter((r) => period === 'month' || r.count >= MIN_ACTIVITIES);

	// For month view, take last 12
	const stats = period === 'month' ? filtered.slice(-12) : filtered;

	const prs = await getUserPRs(userId);

	return {
		stats,
		sportTypes: sportTypes.map((r) => r.sportType),
		filters: { period, sport },
		prs,
	};
};
