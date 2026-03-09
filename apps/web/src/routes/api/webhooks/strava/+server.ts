import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQueue } from '$lib/server/queue';
import { logger } from '$lib/server/logger';
import { JobPriority } from '@web-runner/shared';
import type { WebhookEventJobData } from '@web-runner/shared';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url }) => {
	const mode = url.searchParams.get('hub.mode');
	const challenge = url.searchParams.get('hub.challenge');
	const verifyToken = url.searchParams.get('hub.verify_token');

	if (mode === 'subscribe' && verifyToken === env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
		logger.info('Webhook subscription validated');
		return json({ 'hub.challenge': challenge });
	}

	return json({ error: 'Invalid verify token' }, { status: 403 });
};

function validateWebhookEvent(payload: unknown): payload is {
	subscription_id: number;
	object_type: string;
	object_id: number;
	aspect_type: string;
	owner_id: number;
	event_time: number;
	updates?: Record<string, string>;
} {
	if (typeof payload !== 'object' || payload === null) return false;
	const p = payload as Record<string, unknown>;
	return (
		typeof p.subscription_id === 'number' &&
		typeof p.object_type === 'string' &&
		typeof p.object_id === 'number' &&
		typeof p.aspect_type === 'string' &&
		typeof p.owner_id === 'number' &&
		typeof p.event_time === 'number'
	);
}

export const POST: RequestHandler = async ({ request }) => {
	const payload = await request.json();

	if (!validateWebhookEvent(payload)) {
		logger.warn({ payload }, 'Invalid webhook payload');
		return json({ error: 'Invalid payload' }, { status: 400 });
	}

	const expectedSubId = env.STRAVA_WEBHOOK_SUBSCRIPTION_ID;
	if (!expectedSubId) {
		logger.error('STRAVA_WEBHOOK_SUBSCRIPTION_ID not configured, rejecting webhook');
		return json({ error: 'Webhook not configured' }, { status: 500 });
	}
	if (String(payload.subscription_id) !== expectedSubId) {
		logger.warn({ subscriptionId: payload.subscription_id }, 'Unknown subscription ID');
		return json({ error: 'Unknown subscription' }, { status: 403 });
	}

	logger.info(
		{ objectType: payload.object_type, aspectType: payload.aspect_type, objectId: payload.object_id },
		'Webhook event received',
	);

	const jobData: WebhookEventJobData = { type: 'webhook-event', event: payload };
	const queue = getQueue();
	await queue.add('webhook-event', jobData, { priority: JobPriority.webhook });

	return json({ ok: true });
};
