import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { featureFlags } from '@web-runner/db/schema';
import { getAllFlags, invalidateFlagCache } from '$lib/server/feature-flags';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async () => {
	const flags = await getAllFlags();
	return { flags };
};

export const actions: Actions = {
	toggle: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const data = await request.formData();
		const flagId = Number(data.get('flagId'));

		const db = getDb();
		const [flag] = await db
			.select({ enabled: featureFlags.enabled, key: featureFlags.key })
			.from(featureFlags)
			.where(eq(featureFlags.id, flagId));

		if (!flag) return fail(404, { error: 'Flag not found' });

		await db
			.update(featureFlags)
			.set({ enabled: !flag.enabled, updatedAt: new Date() })
			.where(eq(featureFlags.id, flagId));

		invalidateFlagCache(flag.key);
	},

	create: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const data = await request.formData();
		const key = String(data.get('key')).trim();
		const description = String(data.get('description') || '').trim();

		if (!key) return fail(400, { error: 'Key is required' });
		if (!/^[a-z][a-z0-9_]*$/.test(key)) {
			return fail(400, { error: 'Key must be lowercase alphanumeric with underscores' });
		}

		const db = getDb();
		try {
			await db.insert(featureFlags).values({
				key,
				description: description || null,
			});
		} catch {
			return fail(400, { error: 'Flag with this key already exists' });
		}
	},

	delete: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const data = await request.formData();
		const flagId = Number(data.get('flagId'));

		const db = getDb();
		const [flag] = await db
			.select({ key: featureFlags.key })
			.from(featureFlags)
			.where(eq(featureFlags.id, flagId));

		if (!flag) return fail(404, { error: 'Flag not found' });

		await db.delete(featureFlags).where(eq(featureFlags.id, flagId));
		invalidateFlagCache(flag.key);
	},
};
