import { describe, it, expect } from 'vitest';
import {
	getAvailableDataSources,
	getStreamForSource,
	getUnitForSource,
	isInvertedSource,
	getZonesForSource,
	CHART_TYPE_MATRIX,
	type StreamData,
} from './terminal-state.svelte';

function emptyStreams(overrides: Partial<StreamData> = {}): StreamData {
	return {
		velocity: null,
		heartrate: null,
		altitude: null,
		cadence: null,
		power: null,
		grade: null,
		distance: null,
		time: null,
		latlng: null,
		...overrides,
	};
}

describe('getAvailableDataSources', () => {
	it('returns empty for no streams', () => {
		expect(getAvailableDataSources(emptyStreams())).toEqual([]);
	});

	it('returns pace when velocity present', () => {
		const sources = getAvailableDataSources(emptyStreams({ velocity: [1, 2] }));
		expect(sources).toContain('pace');
	});

	it('returns heartrate when present', () => {
		const sources = getAvailableDataSources(emptyStreams({ heartrate: [100, 120] }));
		expect(sources).toContain('heartrate');
	});

	it('returns all sources when all streams present', () => {
		const streams = emptyStreams({
			velocity: [1],
			heartrate: [1],
			altitude: [1],
			cadence: [1],
			power: [1],
			grade: [1],
		});
		expect(getAvailableDataSources(streams)).toHaveLength(6);
	});
});

describe('getStreamForSource', () => {
	it('converts velocity to pace (sec/km) in metric', () => {
		const streams = emptyStreams({ velocity: [4.0] });
		const pace = getStreamForSource(streams, 'pace', 'metric');
		expect(pace).toEqual([250]);
	});

	it('returns null for missing stream', () => {
		expect(getStreamForSource(emptyStreams(), 'pace', 'metric')).toBeNull();
	});

	it('converts altitude to feet for imperial', () => {
		const streams = emptyStreams({ altitude: [100] });
		const elev = getStreamForSource(streams, 'elevation', 'imperial');
		expect(elev![0]).toBeCloseTo(328.084, 1);
	});

	it('returns altitude as-is for metric', () => {
		const streams = emptyStreams({ altitude: [100] });
		const elev = getStreamForSource(streams, 'elevation', 'metric');
		expect(elev).toEqual([100]);
	});

	it('doubles cadence values (half-cycles to full strides)', () => {
		const streams = emptyStreams({ cadence: [85] });
		const result = getStreamForSource(streams, 'cadence', 'metric');
		expect(result).toEqual([170]);
	});

	it('returns heartrate as-is', () => {
		const streams = emptyStreams({ heartrate: [150] });
		expect(getStreamForSource(streams, 'heartrate', 'metric')).toEqual([150]);
	});

	it('returns power as-is', () => {
		const streams = emptyStreams({ power: [200] });
		expect(getStreamForSource(streams, 'power', 'metric')).toEqual([200]);
	});

	it('returns grade as-is', () => {
		const streams = emptyStreams({ grade: [5.2] });
		expect(getStreamForSource(streams, 'grade', 'metric')).toEqual([5.2]);
	});

	it('handles zero velocity gracefully', () => {
		const streams = emptyStreams({ velocity: [0] });
		const pace = getStreamForSource(streams, 'pace', 'metric');
		expect(pace).toEqual([0]);
	});
});

describe('getUnitForSource', () => {
	it('returns empty for pace', () => {
		expect(getUnitForSource('pace', 'metric')).toBe('');
	});

	it('returns bpm for heartrate', () => {
		expect(getUnitForSource('heartrate', 'metric')).toBe(' bpm');
	});

	it('returns m for metric elevation', () => {
		expect(getUnitForSource('elevation', 'metric')).toBe(' m');
	});

	it('returns ft for imperial elevation', () => {
		expect(getUnitForSource('elevation', 'imperial')).toBe(' ft');
	});

	it('returns spm for cadence', () => {
		expect(getUnitForSource('cadence', 'metric')).toBe(' spm');
	});

	it('returns W for power', () => {
		expect(getUnitForSource('power', 'metric')).toBe(' W');
	});

	it('returns % for grade', () => {
		expect(getUnitForSource('grade', 'metric')).toBe('%');
	});
});

describe('isInvertedSource', () => {
	it('returns true for pace', () => {
		expect(isInvertedSource('pace')).toBe(true);
	});

	it('returns false for heartrate', () => {
		expect(isInvertedSource('heartrate')).toBe(false);
	});
});

describe('getZonesForSource', () => {
	const paceZones = [{ index: 0, name: 'Z1', color: '#00f', paceMin: 300, paceMax: 360, hrMin: null, hrMax: null }];
	const hrZones = [{ index: 0, name: 'Z1', color: '#f00', paceMin: null, paceMax: null, hrMin: 120, hrMax: 140 }];

	it('returns pace zones for pace source', () => {
		const result = getZonesForSource('pace', paceZones, hrZones, 'metric');
		expect(result).not.toBeNull();
		expect(result!.metric).toBe('pace');
		expect(result!.zones).toEqual(paceZones);
	});

	it('converts pace zones for imperial', () => {
		const result = getZonesForSource('pace', paceZones, hrZones, 'imperial');
		expect(result!.zones[0].paceMin).toBeGreaterThan(300);
	});

	it('returns hr zones for heartrate source', () => {
		const result = getZonesForSource('heartrate', paceZones, hrZones, 'metric');
		expect(result!.metric).toBe('heartrate');
		expect(result!.zones).toEqual(hrZones);
	});

	it('returns null for elevation source', () => {
		expect(getZonesForSource('elevation', paceZones, hrZones, 'metric')).toBeNull();
	});
});

describe('CHART_TYPE_MATRIX', () => {
	it('allows candlestick only for pace', () => {
		expect(CHART_TYPE_MATRIX.pace).toContain('candlestick');
		expect(CHART_TYPE_MATRIX.heartrate).not.toContain('candlestick');
		expect(CHART_TYPE_MATRIX.elevation).not.toContain('candlestick');
	});

	it('allows bar for pace and cadence', () => {
		expect(CHART_TYPE_MATRIX.pace).toContain('bar');
		expect(CHART_TYPE_MATRIX.cadence).toContain('bar');
		expect(CHART_TYPE_MATRIX.heartrate).not.toContain('bar');
	});
});
