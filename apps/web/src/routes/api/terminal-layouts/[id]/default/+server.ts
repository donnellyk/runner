import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, terminalLayouts } from '@web-runner/db';
import { eq, and } from 'drizzle-orm';
import { requireParamId, requireApiUser } from '$lib/server/validation';

// POST: Set as default (clear existing default first)
export const POST: RequestHandler = async ({ locals, params }) => {
	const user = requireApiUser(locals);
	const id = requireParamId(params.id);

	const db = getDb();

	let found = false;

	// Transaction: clear existing default, then set new one
	await db.transaction(async (tx) => {
		await tx
			.update(terminalLayouts)
			.set({ isDefault: false, updatedAt: new Date() })
			.where(
				and(eq(terminalLayouts.userId, user.id), eq(terminalLayouts.isDefault, true)),
			);

		const result = await tx
			.update(terminalLayouts)
			.set({ isDefault: true, updatedAt: new Date() })
			.where(and(eq(terminalLayouts.id, id), eq(terminalLayouts.userId, user.id)));

		found = (result.rowCount ?? 0) > 0;
	});

	if (!found) return json({ error: 'Not found' }, { status: 404 });
	return json({ ok: true });
};
