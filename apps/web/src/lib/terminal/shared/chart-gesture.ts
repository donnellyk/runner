import type { ChartZoom } from "./chart-zoom.svelte";

export function createWheelHandler(
	getZoom: () => ChartZoom,
	getDims: () => { svgEl: SVGSVGElement | null; chartW: number; chartH: number },
	padding: { left: number; top: number },
): (e: WheelEvent) => void {
	return (e: WheelEvent) => {
		const zoom = getZoom();

		if (zoom.locked) return;

		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();

			const { svgEl, chartW, chartH } = getDims();
			let normX = 0.5;
			let normY = 0.5;

			if (svgEl) {
				const rect = svgEl.getBoundingClientRect();
				const mouseX = e.clientX - rect.left - padding.left;
				const mouseY = e.clientY - rect.top - padding.top;
				normX = Math.max(0, Math.min(1, mouseX / chartW));
				normY = Math.max(0, Math.min(1, mouseY / chartH));
			}

			const factor = 1 - e.deltaY * 0.005;

			if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5) {
				zoom.zoomX(factor, normX);
			} else {
				zoom.zoomY(factor, normY);
			}
		} else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
			e.preventDefault();
			zoom.panX(e.deltaX * 0.002);
		} else if (e.shiftKey) {
			e.preventDefault();
			zoom.panX(e.deltaY * 0.002);
		}
	};
}
