/**
 * Generates a mesh-style gradient CSS background from a single hex color.
 * Creates 4 color variations and layers radial gradients at different positions
 * to produce a soft, organic, flowing effect.
 */

function hexToHsl(hex: string): [number, number, number] {
	const raw = hex.replace('#', '');
	const r = parseInt(raw.substring(0, 2), 16) / 255;
	const g = parseInt(raw.substring(2, 4), 16) / 255;
	const b = parseInt(raw.substring(4, 6), 16) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;

	if (max === min) return [0, 0, l * 100];

	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

	let h: number;
	if (max === r) {
		h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	} else if (max === g) {
		h = ((b - r) / d + 2) / 6;
	} else {
		h = ((r - g) / d + 4) / 6;
	}

	return [h * 360, s * 100, l * 100];
}

function hsl(h: number, s: number, l: number): string {
	const hue = ((h % 360) + 360) % 360;
	return `hsl(${Math.round(hue)} ${Math.round(Math.min(100, Math.max(0, s)))}% ${Math.round(Math.min(100, Math.max(0, l)))}%)`;
}

function rand(lo: number, hi: number): number {
	return lo + Math.random() * (hi - lo);
}

function randInt(lo: number, hi: number): number {
	return Math.round(rand(lo, hi));
}

/**
 * Returns a CSS `background` value with layered radial gradients that
 * simulate a mesh/aurora gradient from a single hex color.
 * Positions are randomized so each call produces a unique gradient.
 */
export function meshGradientStyle(hex: string): string {
	const [h, s, l] = hexToHsl(hex);

	// Derive 4 color stops with slight random hue/lightness variation
	const base = hsl(h + rand(-3, 3), s, l);
	const lighter = hsl(h - rand(2, 10), Math.max(s - rand(5, 15), 20), Math.min(l + rand(16, 28), 85));
	const darker = hsl(h + rand(4, 14), Math.min(s + rand(6, 18), 95), Math.max(l - rand(12, 24), 20));
	const shifted = hsl(h + rand(25, 50), Math.min(s + rand(0, 10), 90), Math.min(l + rand(3, 14), 75));

	const angle = randInt(110, 160);

	// Layer radial gradients at randomized positions
	return [
		`radial-gradient(ellipse ${randInt(70, 95)}% ${randInt(65, 90)}% at ${randInt(5, 30)}% ${randInt(10, 35)}%, ${lighter}, transparent ${randInt(60, 80)}%)`,
		`radial-gradient(ellipse ${randInt(60, 85)}% ${randInt(50, 75)}% at ${randInt(70, 95)}% ${randInt(15, 40)}%, ${shifted}, transparent ${randInt(55, 75)}%)`,
		`radial-gradient(ellipse ${randInt(75, 100)}% ${randInt(55, 80)}% at ${randInt(35, 65)}% ${randInt(75, 95)}%, ${darker}, transparent ${randInt(50, 70)}%)`,
		`radial-gradient(ellipse ${randInt(50, 75)}% ${randInt(40, 60)}% at ${randInt(55, 80)}% ${randInt(40, 65)}%, ${base}, transparent ${randInt(45, 65)}%)`,
		`linear-gradient(${angle}deg, ${darker} 0%, ${base} 50%, ${lighter} 100%)`,
	].join(', ');
}

/**
 * Inline SVG noise filter as a data URI for use as a CSS background-image overlay.
 * Apply with: background-image: url(noiseDataUri); opacity: ~0.06;
 */
export const NOISE_FILTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="300" height="300" filter="url(#n)" opacity="1"/></svg>`;

export const NOISE_DATA_URI = `url("data:image/svg+xml,${encodeURIComponent(NOISE_FILTER_SVG)}")`;
