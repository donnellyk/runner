import type { Padding } from "./chart-utils";

export function createChartDimensions(padding: Padding) {
	let svgEl = $state<SVGSVGElement | null>(null);
	let svgWidth = $state(400);
	let svgHeight = $state(160);

	$effect(() => {
		if (!svgEl) return;
		const ro = new ResizeObserver(([entry]) => {
			svgWidth = entry.contentRect.width;
			svgHeight = entry.contentRect.height;
		});
		ro.observe(svgEl);
		return () => ro.disconnect();
	});

	const chartW = $derived(svgWidth - padding.left - padding.right);
	const chartH = $derived(svgHeight - padding.top - padding.bottom);

	return {
		get svgEl() {
			return svgEl;
		},
		set svgEl(el: SVGSVGElement | null) {
			svgEl = el;
		},
		get svgWidth() {
			return svgWidth;
		},
		get svgHeight() {
			return svgHeight;
		},
		get chartW() {
			return chartW;
		},
		get chartH() {
			return chartH;
		},
		padding,
	};
}

export type ChartDimensions = ReturnType<typeof createChartDimensions>;
