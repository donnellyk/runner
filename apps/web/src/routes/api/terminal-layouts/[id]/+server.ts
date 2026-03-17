import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, terminalLayouts } from '@web-runner/db';
import { eq, and } from 'drizzle-orm';
import { requireParamId } from '$lib/server/validation';

// PUT: Update layout
export const PUT: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const id = requireParamId(params.id);

	const body = await request.json();
	const updates: Record<string, unknown> = {};
	if (typeof body.name === 'string' && body.name.length <= 100) updates.name = body.name;
	if (typeof body.encoded === 'string' && body.encoded.length <= 10000) updates.encoded = body.encoded;
	if (body.isDefault === false) updates.isDefault = false;
	updates.updatedAt = new Date();

	if (Object.keys(updates).length === 1) {
		return json({ error: 'No fields to update' }, { status: 400 });
	}

	const db = getDb();
	const result = await db
		.update(terminalLayouts)
		.set(updates)
		.where(and(eq(terminalLayouts.id, id), eq(terminalLayouts.userId, locals.user.id)))
		.returning({ id: terminalLayouts.id });

	if (result.length === 0) return json({ error: 'Not found' }, { status: 404 });
	return json({ ok: true });
};

// DELETE: Delete layout
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const id = requireParamId(params.id);

	const db = getDb();
	const result = await db
		.delete(terminalLayouts)
		.where(and(eq(terminalLayouts.id, id), eq(terminalLayouts.userId, locals.user.id)))
		.returning({ id: terminalLayouts.id });

	if (result.length === 0) return json({ error: 'Not found' }, { status: 404 });
	return json({ ok: true });
};
