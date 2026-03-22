import type { StreamData, ActivityNote, ActivityLap, ActivitySegment } from './terminal-state.svelte';
import { COLOR_PALETTE } from './terminal-state.svelte';
import type { ActivityData } from './types';
import { prepareStreams, prepareNotes, prepareLaps, prepareSegments } from './prepare-page-data';

export const COMPARE_COLORS = COLOR_PALETTE.slice(0, 4).map((c) => c.value);
export const MAX_COMPARE_ACTIVITIES = 4;

export interface CompareActivity {
	id: number;
	name: string;
	startDate: string;
	color: string;
	selected: boolean;
	activity: ActivityData;
	streams: StreamData;
	laps: ActivityLap[];
	segments: ActivitySegment[];
	notes: ActivityNote[];
}

export function createCompareState(
	primaryActivity: {
		id: number;
		name: string;
		startDate: string | Date;
		sportType: string;
		activity: ActivityData;
		streams: StreamData;
		laps: ActivityLap[];
		segments: ActivitySegment[];
		notes: ActivityNote[];
	},
) {
	let activities = $state<CompareActivity[]>([
		{
			id: primaryActivity.id,
			name: primaryActivity.name,
			startDate: typeof primaryActivity.startDate === 'string'
				? primaryActivity.startDate
				: primaryActivity.startDate.toISOString(),
			color: COMPARE_COLORS[0],
			selected: true,
			activity: primaryActivity.activity,
			streams: primaryActivity.streams,
			laps: primaryActivity.laps,
			segments: primaryActivity.segments,
			notes: primaryActivity.notes,
		},
	]);
	let compareMode = $state(false);
	let activeIndex = $state(0);
	let loading = $state(false);

	const sportType = primaryActivity.sportType;

	return {
		get activities() { return activities; },
		get compareMode() { return compareMode; },
		set compareMode(v: boolean) { compareMode = v; },
		get activeIndex() { return activeIndex; },
		set activeIndex(v: number) { activeIndex = v; },
		get loading() { return loading; },
		set loading(v: boolean) { loading = v; },
		get sportType() { return sportType; },

		get canCompare() { return activities.length >= 2; },
		get canAddMore() { return activities.length < MAX_COMPARE_ACTIVITIES; },

		get selectedActivities(): CompareActivity[] {
			return activities.filter((a) => a.selected);
		},

		get activeActivity(): CompareActivity {
			return activities[activeIndex] ?? activities[0];
		},

		async addActivity(activityId: number) {
			if (activities.some((a) => a.id === activityId)) return;
			if (activities.length >= MAX_COMPARE_ACTIVITIES) return;

			loading = true;
			try {
				const res = await fetch(`/api/activities/${activityId}/terminal-data`);
				if (!res.ok) throw new Error('Failed to fetch activity data');

				const data = await res.json();
				const newActivity: CompareActivity = {
					id: data.activity.id,
					name: data.activity.name,
					startDate: data.activity.startDate,
					color: COMPARE_COLORS[activities.length] ?? COMPARE_COLORS[0],
					selected: true,
					activity: {
						distance: data.activity.distance,
						movingTime: data.activity.movingTime,
						averageSpeed: data.activity.averageSpeed,
						averageHeartrate: data.activity.averageHeartrate,
						totalElevationGain: data.activity.totalElevationGain,
						averageCadence: data.activity.averageCadence,
						routeGeoJson: data.activity.routeGeoJson,
					},
					streams: prepareStreams(data.streamMap),
					laps: prepareLaps(data.laps),
					segments: prepareSegments(data.segments),
					notes: prepareNotes(data.notes),
				};
				activities = [...activities, newActivity];
			} finally {
				loading = false;
			}
		},

		removeActivity(activityId: number) {
			if (activities[0]?.id === activityId) return; // can't remove primary
			const idx = activities.findIndex((a) => a.id === activityId);
			if (idx === -1) return;

			activities = activities.filter((a) => a.id !== activityId);

			if (activeIndex >= activities.length) {
				activeIndex = activities.length - 1;
			}
			// Auto-exit compare mode if fewer than 2 remain
			if (activities.length < 2) {
				compareMode = false;
			}
		},

		toggleSelected(activityId: number) {
			const selected = activities.filter((a) => a.selected);
			const target = activities.find((a) => a.id === activityId);
			if (!target) return;

			// Don't deselect if it would leave fewer than 2 selected
			if (target.selected && selected.length <= 2) return;

			activities = activities.map((a) =>
				a.id === activityId ? { ...a, selected: !a.selected } : a,
			);
		},

		setColor(activityId: number, color: string) {
			activities = activities.map((a) =>
				a.id === activityId ? { ...a, color } : a,
			);
		},
	};
}

export type CompareStateType = ReturnType<typeof createCompareState>;

export function findOverlayCrosshairIndex(
	primaryXData: number[],
	overlayXData: number[],
	primaryIndex: number,
): number | null {
	if (primaryIndex >= primaryXData.length) return null;
	const targetValue = primaryXData[primaryIndex];
	if (targetValue == null) return null;

	// If overlay is shorter than target, return null
	const lastOverlayValue = overlayXData[overlayXData.length - 1];
	if (lastOverlayValue == null || targetValue > lastOverlayValue) return null;

	// Binary search for closest index
	let lo = 0;
	let hi = overlayXData.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (overlayXData[mid] < targetValue) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

export const DISABLED_PANEL_TYPES_IN_COMPARE = ['candlestick', 'heatmap', 'notes', 'laps'] as const;

export function isPanelDisabledInCompare(config: { kind: string; chartType?: string; specialType?: string }): boolean {
	if (config.kind === 'chart' && config.chartType === 'candlestick') return true;
	if (config.kind === 'special' && config.specialType) {
		return (DISABLED_PANEL_TYPES_IN_COMPARE as readonly string[]).includes(config.specialType);
	}
	return false;
}
