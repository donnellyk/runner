import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, terminalLayouts } from '@web-runner/db';
import { eq, asc } from 'drizzle-orm';
import { requireApiUser } from '$lib/server/validation';

// GET: List user's saved layouts
export const GET: RequestHandler = async ({ locals }) => {
	const user = requireApiUser(locals);

	const db = getDb();
	const layouts = await db
		.select()
		.from(terminalLayouts)
		.where(eq(terminalLayouts.userId, user.id))
		.orderBy(asc(terminalLayouts.updatedAt));

	return json({ layouts });
};

// POST: Create new layout
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireApiUser(locals);

	const body = await request.json();
	if (!body.name || !body.encoded) {
		return json({ error: 'Missing name or encoded' }, { status: 400 });
	}

	const db = getDb();
	const [layout] = await db
		.insert(terminalLayouts)
		.values({
			userId: user.id,
			name: body.name,
			encoded: body.encoded,
		})
		.returning({ id: terminalLayouts.id });

	return json({ id: layout.id }, { status: 201 });
};
