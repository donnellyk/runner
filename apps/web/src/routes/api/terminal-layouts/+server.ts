import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, terminalLayouts } from '@web-runner/db';
import { eq, asc } from 'drizzle-orm';

// GET: List user's saved layouts
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const db = getDb();
	const layouts = await db
		.select()
		.from(terminalLayouts)
		.where(eq(terminalLayouts.userId, locals.user.id))
		.orderBy(asc(terminalLayouts.updatedAt));

	return json({ layouts });
};

// POST: Create new layout
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json();
	if (!body.name || !body.encoded) {
		return json({ error: 'Missing name or encoded' }, { status: 400 });
	}

	const db = getDb();
	const [layout] = await db
		.insert(terminalLayouts)
		.values({
			userId: locals.user.id,
			name: body.name,
			encoded: body.encoded,
		})
		.returning({ id: terminalLayouts.id });

	return json({ id: layout.id }, { status: 201 });
};
