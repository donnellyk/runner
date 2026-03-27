import { error, fail } from '@sveltejs/kit';
import { getActivity } from '$lib/server/queries/activities';
import { getMatchedWorkoutForActivity } from '$lib/server/queries/plan-queries';
import { parseId, requireParamId } from '$lib/server/validation';
import { getDb } from '@web-runner/db/client';
import { activityNotes, activities } from '@web-runner/db/schema';
import { eq, and } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = locals.user!.id;
	const id = requireParamId(params.id);

	const [result, matchedWorkout] = await Promise.all([
		getActivity(id, userId),
		getMatchedWorkoutForActivity(id, userId),
	]);
	if (!result) error(404, 'Activity not found');

	return { ...result, matchedWorkout };
};

async function verifyActivityOwnership(activityId: number, userId: number) {
	const db = getDb();
	const [activity] = await db
		.select({ id: activities.id, distance: activities.distance })
		.from(activities)
		.where(and(eq(activities.id, activityId), eq(activities.userId, userId)));
	return activity ?? null;
}

export const actions: Actions = {
	createNote: async ({ params, request, locals }) => {
		const userId = locals.user!.id;
		const activityId = parseId(params.id);
		if (!activityId) return fail(400, { error: 'Invalid activity' });

		const activity = await verifyActivityOwnership(activityId, userId);
		if (!activity) return fail(404, { error: 'Activity not found' });

		const formData = await request.formData();
		const distanceStart = parseFloat(formData.get('distanceStart') as string);
		const distanceEnd = formData.get('distanceEnd')
			? parseFloat(formData.get('distanceEnd') as string)
			: null;
		const content = (formData.get('content') as string)?.trim();

		if (isNaN(distanceStart) || distanceStart < 0) {
			return fail(400, { error: 'Invalid start distance' });
		}
		if (distanceEnd !== null && (isNaN(distanceEnd) || distanceEnd <= distanceStart)) {
			return fail(400, { error: 'End distance must be greater than start distance' });
		}
		if (activity.distance && (distanceStart > activity.distance ||
			(distanceEnd !== null && distanceEnd > activity.distance))) {
			return fail(400, { error: 'Distance exceeds activity length' });
		}
		if (!content || content.length > 1000) {
			return fail(400, { error: 'Content is required (max 1000 characters)' });
		}

		const db = getDb();
		await db.insert(activityNotes).values({
			activityId,
			distanceStart,
			distanceEnd,
			content,
		});
	},

	updateNote: async ({ params, request, locals }) => {
		const userId = locals.user!.id;
		const activityId = parseId(params.id);
		if (!activityId) return fail(400, { error: 'Invalid activity' });

		const activity = await verifyActivityOwnership(activityId, userId);
		if (!activity) return fail(404, { error: 'Activity not found' });

		const formData = await request.formData();
		const noteId = parseId(formData.get('noteId'));
		if (!noteId) return fail(400, { error: 'Invalid note' });

		const content = (formData.get('content') as string)?.trim();
		if (!content || content.length > 1000) {
			return fail(400, { error: 'Content is required (max 1000 characters)' });
		}

		const updates: Record<string, unknown> = { content, updatedAt: new Date() };

		const distStartStr = formData.get('distanceStart') as string | null;
		if (distStartStr) {
			const distanceStart = parseFloat(distStartStr);
			if (!isNaN(distanceStart) && distanceStart >= 0) updates.distanceStart = distanceStart;
		}
		const distEndStr = formData.get('distanceEnd') as string | null;
		if (distEndStr !== null) {
			updates.distanceEnd = distEndStr ? parseFloat(distEndStr) : null;
		}

		const db = getDb();
		await db.update(activityNotes)
			.set(updates)
			.where(and(eq(activityNotes.id, noteId), eq(activityNotes.activityId, activityId)));
	},

	deleteNote: async ({ params, request, locals }) => {
		const userId = locals.user!.id;
		const activityId = parseId(params.id);
		if (!activityId) return fail(400, { error: 'Invalid activity' });

		const activity = await verifyActivityOwnership(activityId, userId);
		if (!activity) return fail(404, { error: 'Activity not found' });

		const formData = await request.formData();
		const noteId = parseId(formData.get('noteId'));
		if (!noteId) return fail(400, { error: 'Invalid note' });

		const db = getDb();
		await db.delete(activityNotes)
			.where(and(eq(activityNotes.id, noteId), eq(activityNotes.activityId, activityId)));
	},
};
