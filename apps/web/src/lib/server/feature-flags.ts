import { eq } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { featureFlags } from '@web-runner/db/schema';

const cache = new Map<string, { enabled: boolean; expiresAt: number }>();
const CACHE_TTL = 30_000;

export async function isFeatureEnabled(key: string): Promise<boolean> {
	const cached = cache.get(key);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.enabled;
	}

	const db = getDb();
	const [row] = await db
		.select({ enabled: featureFlags.enabled })
		.from(featureFlags)
		.where(eq(featureFlags.key, key))
		.limit(1);

	const enabled = row?.enabled ?? false;
	cache.set(key, { enabled, expiresAt: Date.now() + CACHE_TTL });
	return enabled;
}

export async function getAllFlags() {
	const db = getDb();
	return db
		.select()
		.from(featureFlags)
		.orderBy(featureFlags.key);
}

export function invalidateFlagCache(key?: string) {
	if (key) {
		cache.delete(key);
	} else {
		cache.clear();
	}
}
