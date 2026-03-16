import { describe, it, expect } from 'vitest';
import {
  encodeLayout,
  decodeLayout,
  encodeSettings,
  decodeSettings,
  buildTerminalUrl,
  DEFAULT_LAYOUT,
  DEFAULT_SETTINGS,
  type LayoutPanel,
  type TerminalSettings,
} from './layout-url';

describe('layout encoding', () => {
  it('round-trips the default layout', () => {
    const encoded = encodeLayout(DEFAULT_LAYOUT);
    const { panels, warning } = decodeLayout(encoded);
    expect(warning).toBeUndefined();
    expect(panels).toHaveLength(DEFAULT_LAYOUT.length);
    for (let i = 0; i < DEFAULT_LAYOUT.length; i++) {
      expect(panels[i].config).toEqual(DEFAULT_LAYOUT[i].config);
      expect(panels[i].placement).toEqual(DEFAULT_LAYOUT[i].placement);
      expect(panels[i].id).toBe(i + 1);
    }
  });

  it('round-trips a custom asymmetric layout', () => {
    const custom: LayoutPanel[] = [
      { id: 1, config: { kind: 'special', specialType: 'heatmap' }, placement: { col: 0, row: 0, colSpan: 6, rowSpan: 4 } },
      { id: 2, config: { kind: 'chart', dataSource: 'power', chartType: 'line' }, placement: { col: 6, row: 0, colSpan: 6, rowSpan: 2 } },
      { id: 3, config: { kind: 'chart', dataSource: 'grade', chartType: 'bar' }, placement: { col: 6, row: 2, colSpan: 3, rowSpan: 2 } },
    ];

    const encoded = encodeLayout(custom);
    const { panels, warning } = decodeLayout(encoded);
    expect(warning).toBeUndefined();
    expect(panels).toHaveLength(3);
    for (let i = 0; i < custom.length; i++) {
      expect(panels[i].config).toEqual(custom[i].config);
      expect(panels[i].placement).toEqual(custom[i].placement);
    }
  });

  it('returns default with warning for malformed input', () => {
    const { panels, warning } = decodeLayout('!!!invalid!!!');
    expect(warning).toBeDefined();
    expect(panels).toHaveLength(DEFAULT_LAYOUT.length);
    expect(panels[0].config).toEqual(DEFAULT_LAYOUT[0].config);
  });

  it('returns default with warning for empty string', () => {
    const { panels, warning } = decodeLayout('');
    expect(warning).toBeDefined();
    expect(panels).toHaveLength(DEFAULT_LAYOUT.length);
  });

  it('round-trips each data source', () => {
    const sources = ['pace', 'heartrate', 'elevation', 'cadence', 'power', 'grade'] as const;
    for (const source of sources) {
      const panel: LayoutPanel[] = [
        { id: 1, config: { kind: 'chart', dataSource: source, chartType: 'line' }, placement: { col: 0, row: 0, colSpan: 4, rowSpan: 3 } },
      ];
      const { panels, warning } = decodeLayout(encodeLayout(panel));
      expect(warning).toBeUndefined();
      expect(panels[0].config.dataSource).toBe(source);
    }
  });

  it('round-trips each special panel type', () => {
    const specials = ['map', 'notes', 'heatmap', 'laps'] as const;
    for (const special of specials) {
      const panel: LayoutPanel[] = [
        { id: 1, config: { kind: 'special', specialType: special }, placement: { col: 0, row: 0, colSpan: 4, rowSpan: 3 } },
      ];
      const { panels, warning } = decodeLayout(encodeLayout(panel));
      expect(warning).toBeUndefined();
      expect(panels[0].config.specialType).toBe(special);
    }
  });

  it('round-trips each chart type', () => {
    const chartConfigs: LayoutPanel['config'][] = [
      { kind: 'chart', dataSource: 'pace', chartType: 'line' },
      { kind: 'chart', dataSource: 'pace', chartType: 'area' },
      { kind: 'chart', dataSource: 'pace', chartType: 'bar' },
      { kind: 'chart', dataSource: 'pace', chartType: 'candlestick', candlestickMode: 'splits' },
      { kind: 'chart', dataSource: 'pace', chartType: 'candlestick', candlestickMode: 'laps' },
    ];
    for (const config of chartConfigs) {
      const panel: LayoutPanel[] = [
        { id: 1, config, placement: { col: 0, row: 0, colSpan: 4, rowSpan: 3 } },
      ];
      const { panels, warning } = decodeLayout(encodeLayout(panel));
      expect(warning).toBeUndefined();
      expect(panels[0].config).toEqual(config);
    }
  });

  it('assigns sequential IDs starting at 1', () => {
    const custom: LayoutPanel[] = [
      { id: 99, config: { kind: 'special', specialType: 'map' }, placement: { col: 0, row: 0, colSpan: 12, rowSpan: 6 } },
      { id: 50, config: { kind: 'chart', dataSource: 'pace', chartType: 'line' }, placement: { col: 0, row: 0, colSpan: 6, rowSpan: 3 } },
    ];
    const { panels } = decodeLayout(encodeLayout(custom));
    expect(panels[0].id).toBe(1);
    expect(panels[1].id).toBe(2);
  });
});

describe('settings encoding', () => {
  it('encodes all defaults as empty string', () => {
    const result = encodeSettings(DEFAULT_SETTINGS);
    expect(result).toBe('');
  });

  it('decodes missing params as defaults', () => {
    const result = decodeSettings(new URLSearchParams(''));
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips non-default settings', () => {
    const settings: TerminalSettings = {
      xAxis: 'time',
      showZones: true,
      showNotes: false,
      showPauseGaps: false,
      smoothingWindow: 4,
      samplePoints: 1000,
      pauseThreshold: 2.5,
      wickPercentile: 10,
    };
    const encoded = encodeSettings(settings);
    expect(encoded).toContain('x=t');
    expect(encoded).toContain('z=1');
    expect(encoded).toContain('n=0');
    expect(encoded).toContain('pg=0');
    expect(encoded).toContain('sm=4');
    expect(encoded).toContain('sp=1000');
    expect(encoded).toContain('pt=2.5');
    expect(encoded).toContain('wp=10');

    const decoded = decodeSettings(new URLSearchParams(encoded));
    expect(decoded).toEqual(settings);
  });

  it('encodes only non-default values', () => {
    const settings: TerminalSettings = {
      ...DEFAULT_SETTINGS,
      showZones: true,
      smoothingWindow: 5,
    };
    const encoded = encodeSettings(settings);
    expect(encoded).toBe('z=1&sm=5');
  });
});

describe('buildTerminalUrl', () => {
  it('returns empty string for default layout and settings', () => {
    const result = buildTerminalUrl(DEFAULT_LAYOUT, DEFAULT_SETTINGS);
    expect(result).toBe('');
  });

  it('includes l param for custom layout', () => {
    const custom: LayoutPanel[] = [
      { id: 1, config: { kind: 'special', specialType: 'map' }, placement: { col: 0, row: 0, colSpan: 12, rowSpan: 6 } },
    ];
    const result = buildTerminalUrl(custom, DEFAULT_SETTINGS);
    expect(result).toMatch(/^\?l=.+/);
    expect(result).not.toContain('z=');
  });

  it('includes settings params without l for default layout', () => {
    const settings: TerminalSettings = { ...DEFAULT_SETTINGS, showZones: true };
    const result = buildTerminalUrl(DEFAULT_LAYOUT, settings);
    expect(result).toBe('?z=1');
  });

  it('includes both l and settings for custom layout and settings', () => {
    const custom: LayoutPanel[] = [
      { id: 1, config: { kind: 'special', specialType: 'map' }, placement: { col: 0, row: 0, colSpan: 12, rowSpan: 6 } },
    ];
    const settings: TerminalSettings = { ...DEFAULT_SETTINGS, smoothingWindow: 4 };
    const result = buildTerminalUrl(custom, settings);
    expect(result).toMatch(/^\?l=.+&sm=4/);
  });
});
