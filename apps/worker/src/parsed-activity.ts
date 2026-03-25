export interface ParsedStreams {
	time: number[] | null;
	distance: number[] | null;
	latlng: [number, number][] | null;
	altitude: number[] | null;
	heartrate: number[] | null;
	cadence: number[] | null;
	watts: number[] | null;
	velocity_smooth: number[] | null;
}

export interface ParsedLap {
	lapIndex: number;
	startDate: Date | null;
	elapsedTime: number | null;
	movingTime: number | null;
	distance: number | null;
	totalElevationGain: number | null;
	averageSpeed: number | null;
	maxSpeed: number | null;
	averageHeartrate: number | null;
	maxHeartrate: number | null;
	averageCadence: number | null;
	averageWatts: number | null;
}

export interface ParsedSessionSummary {
	startDate: Date | null;
	elapsedTime: number | null;
	movingTime: number | null;
	distance: number | null;
	totalElevationGain: number | null;
	totalElevationLoss: number | null;
	averageSpeed: number | null;
	maxSpeed: number | null;
	averageHeartrate: number | null;
	maxHeartrate: number | null;
	averageCadence: number | null;
	averageWatts: number | null;
	deviceName: string | null;
}

export interface ParsedActivity {
	streams: ParsedStreams;
	laps: ParsedLap[];
	summary: ParsedSessionSummary;
}
