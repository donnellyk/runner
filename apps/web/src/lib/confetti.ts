const COLORS = [
	'#fbbf24', '#f59e0b', '#d97706', '#fde68a', '#fcd34d',  // golds
	'#f472b6', '#ec4899', '#db2777',                          // pinks
	'#c084fc', '#a855f7', '#8b5cf6',                          // purples
	'#60a5fa', '#38bdf8',                                     // blues
	'#34d399', '#4ade80',                                     // greens
	'#ffffff', '#fef3c7',                                     // whites
];
const PARTICLE_COUNT = 600;
const DURATION = 5000;
const GRAVITY = 0.08;

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	color: string;
	size: number;
	life: number;
	decay: number;
	rotation: number;
	rotationSpeed: number;
}

export function fireConfetti() {
	const canvas = document.createElement('canvas');
	canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	document.body.appendChild(canvas);

	const ctx = canvas.getContext('2d')!;
	const particles: Particle[] = [];

	for (let i = 0; i < PARTICLE_COUNT; i++) {
		particles.push({
			x: Math.random() * canvas.width,
			y: -Math.random() * 200,
			vx: (Math.random() - 0.5) * 2,
			vy: Math.random() * 3 + 1,
			color: COLORS[Math.floor(Math.random() * COLORS.length)],
			size: Math.random() * 7 + 3,
			life: 1,
			decay: Math.random() * 0.004 + 0.001,
			rotation: Math.random() * Math.PI * 2,
			rotationSpeed: (Math.random() - 0.5) * 0.3,
		});
	}

	const start = performance.now();

	function frame(now: number) {
		const elapsed = now - start;
		if (elapsed > DURATION) {
			canvas.remove();
			return;
		}

		ctx.clearRect(0, 0, canvas.width, canvas.height);

		for (const p of particles) {
			p.x += p.vx;
			p.y += p.vy;
			p.vy += GRAVITY;
			p.life -= p.decay;
			p.rotation += p.rotationSpeed;

			if (p.life <= 0) continue;

			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rotation);
			ctx.globalAlpha = p.life;
			ctx.fillStyle = p.color;
			ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
			ctx.restore();
		}

		requestAnimationFrame(frame);
	}

	requestAnimationFrame(frame);
}
