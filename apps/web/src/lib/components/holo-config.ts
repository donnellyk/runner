export interface HoloConfig {
	brightness: number;
	contrast: number;
	saturate: number;
	afterBrightness: number;
	afterContrast: number;
	afterSaturate: number;
	imgSize: number;
	space: number;
	angle: number;
	blendShine: string;
	blendAfter: string;
}

export const DEFAULT_HOLO_CONFIG: HoloConfig = {
	brightness: 0.5,
	contrast: 2,
	saturate: 1.5,
	afterBrightness: 0.8,
	afterContrast: 1.6,
	afterSaturate: 1.4,
	imgSize: 50,
	space: 5,
	angle: 133,
	blendShine: 'color-dodge',
	blendAfter: 'exclusion',
};
