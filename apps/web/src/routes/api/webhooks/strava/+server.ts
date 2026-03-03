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

export const POST: RequestHandler = async ({ request }) => {
	const event = await request.json();

	const expectedSubId = process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID;
	if (!expectedSubId) {
		logger.error('STRAVA_WEBHOOK_SUBSCRIPTION_ID not configured, rejecting webhook');
		return json({ error: 'Webhook not configured' }, { status: 500 });
	}
	if (String(event.subscription_id) !== expectedSubId) {
		logger.warn({ subscriptionId: event.subscription_id }, 'Unknown subscription ID');
		return json({ error: 'Unknown subscription' }, { status: 403 });
	}

	logger.info(
		{ objectType: event.object_type, aspectType: event.aspect_type, objectId: event.object_id },
		'Webhook event received',
	);

	const jobData: WebhookEventJobData = { type: 'webhook-event', event };
	const queue = getQueue();
	await queue.add('webhook-event', jobData, { priority: JobPriority.webhook });

	return json({ ok: true });
};
