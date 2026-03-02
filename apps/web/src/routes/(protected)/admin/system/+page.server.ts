import { sql } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { getPoolStats } from '@web-runner/db/client';
import { redis } from '$lib/server/redis';
import type { PageServerLoad } from './$types';

function parseRedisInfo(info: string, key: string): string {
	const match = info.match(new RegExp(`${key}:(.+)`));
	return match?.[1]?.trim() ?? 'unknown';
}

export const load: PageServerLoad = async () => {
	const db = getDb();

	const tableStatsResult = await db.execute(sql`
		SELECT
			relname AS table_name,
			n_live_tup AS row_count,
			pg_size_pretty(pg_total_relation_size(relid)) AS total_size
		FROM pg_stat_user_tables
		ORDER BY pg_total_relation_size(relid) DESC
	`);
	const tableStats = tableStatsResult.rows as Array<{
		table_name: string;
		row_count: number;
		total_size: string;
	}>;

	const dbSizeResult = await db.execute(
		sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`,
	);
	const dbSize = (dbSizeResult.rows[0] as { size: string }).size;

	let slowQueries: Array<{
		query: string;
		calls: number;
		total_time_ms: number;
		mean_time_ms: number;
		rows: number;
	}> = [];
	let pgStatAvailable = true;

	try {
		const result = await db.execute(sql`
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
		slowQueries = result.rows as typeof slowQueries;
	} catch {
		pgStatAvailable = false;
	}

	const redisInfo = await redis.info('memory');
	const usedMemory = parseRedisInfo(redisInfo, 'used_memory_human');
	const peakMemory = parseRedisInfo(redisInfo, 'used_memory_peak_human');
	const keyCount = await redis.dbsize();

	const poolStats = getPoolStats();

	return {
		tableStats,
		dbSize,
		slowQueries,
		pgStatAvailable,
		redis: { usedMemory, peakMemory, keyCount },
		poolStats,
	};
};
