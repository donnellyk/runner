export const QUEUE_NAME = 'strava';

export const JobPriority = {
	webhook: 1,
	activityImport: 5,
	fullHistoryImport: 10,
} as const;

export interface ActivityImportJobData {
	type: 'activity-import';
	userId: number;
	activityId: number;
}

export interface FullHistoryImportJobData {
	type: 'full-history-import';
	userId: number;
	/** Unix epoch (seconds). When set, only sync activities after this timestamp. */
	after?: number;
	/** When set, only queue activity-import for activities with these Strava workout_type values. */
	workoutTypeFilter?: number[];
}

export interface WebhookEventJobData {
	type: 'webhook-event';
	event: {
		object_type: string;
		object_id: number;
		aspect_type: string;
		owner_id: number;
		subscription_id: number;
		event_time: number;
		updates?: Record<string, string>;
	};
}

export interface BulkImportJobData {
	type: 'bulk-import';
	userId: number;
	filePath: string;
}

export type JobData =
	| ActivityImportJobData
	| FullHistoryImportJobData
	| WebhookEventJobData
	| BulkImportJobData;
