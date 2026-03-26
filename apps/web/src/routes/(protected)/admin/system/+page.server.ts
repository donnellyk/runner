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
	let n1Candidates: Array<{
		query: string;
		calls: number;
		total_time_ms: number;
		mean_time_ms: number;
		rows: number;
		rows_per_call: number;
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
			WHERE calls > 1
				AND query NOT ILIKE 'CREATE %'
				AND query NOT ILIKE 'ALTER %'
				AND query NOT ILIKE 'DROP %'
				AND query NOT ILIKE 'TRUNCATE %'
				AND query NOT ILIKE 'ANALYZE %'
				AND query NOT ILIKE 'INSERT INTO "spatial_ref_sys"%'
				AND query NOT ILIKE '%install_geocode_settings%'
				AND query NOT ILIKE '--%'
			ORDER BY mean_exec_time DESC
			LIMIT 20
		`);
		slowQueries = result.rows as typeof slowQueries;

		// N+1 candidates: queries that fetch a small number of rows per call
		// but are called many times — the signature of a loop doing one query per parent record.
		// A healthy batched query has high rows/call; an N+1 has rows/call ≈ 1 with high total calls.
		const n1Result = await db.execute(sql`
			SELECT
				query,
				calls,
				round(total_exec_time::numeric, 2) AS total_time_ms,
				round(mean_exec_time::numeric, 2) AS mean_time_ms,
				rows,
				round((rows::numeric / NULLIF(calls, 0)), 1) AS rows_per_call
			FROM pg_stat_statements
			WHERE calls > 100
				AND rows::numeric / NULLIF(calls, 0) <= 5
				AND query ILIKE 'SELECT%'
				AND query NOT ILIKE '%FOR KEY SHARE%'
				AND query NOT ILIKE '%FOR SHARE%'
				AND query NOT ILIKE '--%'
			ORDER BY calls DESC
			LIMIT 10
		`);
		n1Candidates = n1Result.rows as typeof n1Candidates;
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
		n1Candidates,
		pgStatAvailable,
		redis: { usedMemory, peakMemory, keyCount },
		poolStats,
	};
};
