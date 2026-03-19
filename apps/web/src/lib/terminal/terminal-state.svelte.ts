import type { ZoneDefinition } from "@web-runner/shared";
import { KM_TO_MI_PACE, M_TO_FT, type Units } from "$lib/format";
import { DEFAULT_LAYOUT, DEFAULT_SETTINGS, resetNextPanelId, cloneLayout, type LayoutPanel, type TerminalSettings } from "./layout-url";

export type DataSource =
  | "pace"
  | "heartrate"
  | "elevation"
  | "cadence"
  | "power"
  | "grade";
export type ChartType = "line" | "area" | "bar" | "candlestick";
export type SpecialPanel = "map" | "notes" | "heatmap" | "laps";

export interface PanelConfig {
  kind: "chart" | "special";
  dataSource?: DataSource;
  chartType?: ChartType;
  specialType?: SpecialPanel;
  candlestickMode?: "splits" | "laps";
  barMode?: "stream" | "splits" | "laps";
  colorOverride?: string;
  smoothingOverride?: number;
  pauseGapsOverride?: boolean;
  zonesOverride?: boolean;
}

export const COLOR_PALETTE: { label: string; value: string }[] = [
  { label: "Green", value: "#50fa7b" },
  { label: "Cyan", value: "#8be9fd" },
  { label: "Purple", value: "#bd93f9" },
  { label: "Orange", value: "#ff9e44" },
  { label: "Yellow", value: "#f1fa8c" },
  { label: "Pink", value: "#ff6e8a" },
  { label: "Red", value: "#ff5555" },
  { label: "Warm Orange", value: "#ffb86c" },
];

export interface ProcessingParams {
  smoothingWindow: number;
  samplePoints: number;
  pauseThreshold: number;
}

export interface StreamData {
  velocity: number[] | null;
  heartrate: number[] | null;
  altitude: number[] | null;
  cadence: number[] | null;
  power: number[] | null;
  grade: number[] | null;
  distance: number[] | null;
  time: number[] | null;
  latlng: [number, number][] | null;
}

export interface ActivityNote {
  id: number;
  distanceStart: number;
  distanceEnd: number | null;
  content: string;
}

export interface ActivityLap {
  id: number;
  lapIndex: number;
  distance: number | null;
  movingTime: number | null;
  averageSpeed: number | null;
  averageHeartrate: number | null;
  averageCadence: number | null;
}

export interface ActivitySegment {
  id: number;
  segmentIndex: number;
  distanceStart: number;
  distanceEnd: number;
  avgPace: number | null;
  minPace: number | null;
  maxPace: number | null;
  avgHeartrate: number | null;
  avgCadence: number | null;
  avgPower: number | null;
  elevationGain: number | null;
  elevationLoss: number | null;
}

export const CHART_TYPE_MATRIX: Record<DataSource, ChartType[]> = {
  pace: ["line", "area", "bar", "candlestick"],
  heartrate: ["line", "area"],
  elevation: ["line", "area"],
  cadence: ["line", "area", "bar"],
  power: ["line", "area"],
  grade: ["line", "area"],
};

export const DATA_SOURCE_COLORS: Record<DataSource, string> = {
  pace: "var(--term-pace)",
  heartrate: "var(--term-hr)",
  elevation: "var(--term-elevation)",
  cadence: "var(--term-cadence)",
  power: "var(--term-power)",
  grade: "var(--term-grade)",
};

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  pace: "Pace",
  heartrate: "Heart Rate",
  elevation: "Elevation",
  cadence: "Cadence",
  power: "Power",
  grade: "Grade",
};

export const SPECIAL_PANEL_LABELS: Record<SpecialPanel, string> = {
  map: "Map",
  notes: "Notes",
  heatmap: "Heatmap",
  laps: "Laps",
};

export function getPanelLabel(config: PanelConfig): string {
  if (config.kind === "special" && config.specialType) {
    return SPECIAL_PANEL_LABELS[config.specialType];
  }
  if (config.kind === "chart" && config.dataSource) {
    return DATA_SOURCE_LABELS[config.dataSource];
  }
  return "Panel";
}

export function createTerminalState(initialLayout?: LayoutPanel[]) {
  let crosshairIndex = $state<number | null>(null);
  let crosshairLocked = $state(false);
  let highlightedNoteId = $state<number | null>(null);
  let xAxis = $state<"distance" | "time">("distance");
  let params = $state<ProcessingParams>({
    smoothingWindow: 2,
    samplePoints: 500,
    pauseThreshold: 1.0,
  });
  let layoutPanels = $state<LayoutPanel[]>(
    cloneLayout(initialLayout ?? DEFAULT_LAYOUT),
  );
  let showZones = $state(false);
  let showNotes = $state(true);
  let showPauseGaps = $state(true);
  let meshSpeed = $state(1.3);
  let meshDrift = $state(2);
  let meshScale = $state(2);
  let wickPercentile = $state(1);
  let isResizing = $state(false);
  let isDragging = $state(false);
  let activeLayoutId = $state<number | null>(null);
  let uiScale = $state(1);

  return {
    get crosshairIndex() {
      return crosshairIndex;
    },
    set crosshairIndex(v) {
      crosshairIndex = v;
    },
    get crosshairLocked() {
      return crosshairLocked;
    },
    set crosshairLocked(v) {
      crosshairLocked = v;
    },
    get highlightedNoteId() {
      return highlightedNoteId;
    },
    set highlightedNoteId(v) {
      highlightedNoteId = v;
    },
    get xAxis() {
      return xAxis;
    },
    set xAxis(v) {
      xAxis = v;
    },
    get params() {
      return params;
    },
    set params(v) {
      params = v;
    },
    get layoutPanels() {
      return layoutPanels;
    },
    set layoutPanels(v) {
      layoutPanels = v;
    },
    get showZones() {
      return showZones;
    },
    set showZones(v) {
      showZones = v;
    },
    get showNotes() {
      return showNotes;
    },
    set showNotes(v) {
      showNotes = v;
    },
    get showPauseGaps() {
      return showPauseGaps;
    },
    set showPauseGaps(v) {
      showPauseGaps = v;
    },
    get meshSpeed() {
      return meshSpeed;
    },
    set meshSpeed(v) {
      meshSpeed = v;
    },
    get meshDrift() {
      return meshDrift;
    },
    set meshDrift(v) {
      meshDrift = v;
    },
    get meshScale() {
      return meshScale;
    },
    set meshScale(v) {
      meshScale = v;
    },
    get wickPercentile() {
      return wickPercentile;
    },
    set wickPercentile(v) {
      wickPercentile = v;
    },
    get isResizing() {
      return isResizing;
    },
    set isResizing(v) {
      isResizing = v;
    },
    get isDragging() {
      return isDragging;
    },
    set isDragging(v) {
      isDragging = v;
    },
    get activeLayoutId() {
      return activeLayoutId;
    },
    set activeLayoutId(v) {
      activeLayoutId = v;
    },
    get uiScale() {
      return uiScale;
    },
    set uiScale(v) {
      uiScale = v;
    },
    resetLayout() {
      layoutPanels = cloneLayout(DEFAULT_LAYOUT);
      activeLayoutId = null;
      resetNextPanelId(DEFAULT_LAYOUT.length + 1);
      xAxis = DEFAULT_SETTINGS.xAxis;
      showZones = DEFAULT_SETTINGS.showZones;
      showNotes = DEFAULT_SETTINGS.showNotes;
      showPauseGaps = DEFAULT_SETTINGS.showPauseGaps;
      params = {
        smoothingWindow: DEFAULT_SETTINGS.smoothingWindow,
        samplePoints: DEFAULT_SETTINGS.samplePoints,
        pauseThreshold: DEFAULT_SETTINGS.pauseThreshold,
      };
      wickPercentile = DEFAULT_SETTINGS.wickPercentile;
    },
  };
}

export type TerminalState = ReturnType<typeof createTerminalState>;

export function applySettings(state: TerminalState, settings: TerminalSettings): void {
  state.xAxis = settings.xAxis;
  state.showZones = settings.showZones;
  state.showNotes = settings.showNotes;
  state.showPauseGaps = settings.showPauseGaps;
  state.params = {
    smoothingWindow: settings.smoothingWindow,
    samplePoints: settings.samplePoints,
    pauseThreshold: settings.pauseThreshold,
  };
  state.wickPercentile = settings.wickPercentile;
}

export function getSettings(state: TerminalState): TerminalSettings {
  return {
    xAxis: state.xAxis,
    showZones: state.showZones,
    showNotes: state.showNotes,
    showPauseGaps: state.showPauseGaps,
    smoothingWindow: state.params.smoothingWindow,
    samplePoints: state.params.samplePoints,
    pauseThreshold: state.params.pauseThreshold,
    wickPercentile: state.wickPercentile,
  };
}

export function getAvailableDataSources(streams: StreamData): DataSource[] {
  const sources: DataSource[] = [];
  if (streams.velocity) sources.push("pace");
  if (streams.heartrate) sources.push("heartrate");
  if (streams.altitude) sources.push("elevation");
  if (streams.cadence) sources.push("cadence");
  if (streams.power) sources.push("power");
  if (streams.grade) sources.push("grade");
  return sources;
}

export function getStreamForSource(
  streams: StreamData,
  source: DataSource,
  units: Units,
): number[] | null {
  switch (source) {
    case "pace": {
      if (!streams.velocity) return null;
      const secPerKm = streams.velocity.map((ms) => (ms > 0 ? 1000 / ms : 0));
      return units === "imperial"
        ? secPerKm.map((s) => s * KM_TO_MI_PACE)
        : secPerKm;
    }
    case "heartrate":
      return streams.heartrate;
    case "elevation": {
      if (!streams.altitude) return null;
      return units === "imperial"
        ? streams.altitude.map((m) => m * M_TO_FT)
        : streams.altitude;
    }
    case "cadence":
      return streams.cadence ? streams.cadence.map((v) => v * 2) : null;
    case "power":
      return streams.power;
    case "grade":
      return streams.grade;
  }
}

export function getUnitForSource(source: DataSource, units: Units): string {
  switch (source) {
    case "pace":
      return "";
    case "heartrate":
      return " bpm";
    case "elevation":
      return units === "imperial" ? " ft" : " m";
    case "cadence":
      return " spm";
    case "power":
      return " W";
    case "grade":
      return "%";
  }
}

export function isInvertedSource(source: DataSource): boolean {
  return source === "pace";
}

export function getZonesForSource(
  source: DataSource,
  paceZones: ZoneDefinition[],
  hrZones: ZoneDefinition[],
  units: Units,
): { zones: ZoneDefinition[]; metric: "pace" | "heartrate" } | null {
  if (source === "pace") {
    const zones =
      units === "imperial"
        ? paceZones.map((z) => ({
            ...z,
            paceMin: z.paceMin != null ? z.paceMin * KM_TO_MI_PACE : null,
            paceMax: z.paceMax != null ? z.paceMax * KM_TO_MI_PACE : null,
          }))
        : paceZones;
    return { zones, metric: "pace" };
  }
  if (source === "heartrate") {
    return { zones: hrZones, metric: "heartrate" };
  }
  return null;
}
