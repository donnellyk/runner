const COLORS = ['#fbbf24', '#f59e0b', '#d97706', '#fde68a', '#fcd34d', '#ffffff'];
const PARTICLE_COUNT = 300;
const DURATION = 2800;
const GRAVITY = 0.25;

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

export function fireConfetti(originEl: HTMLElement) {
	const rect = originEl.getBoundingClientRect();
	const cx = rect.left + rect.width / 2;
	const cy = rect.top + rect.height / 2;

	const canvas = document.createElement('canvas');
	canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	document.body.appendChild(canvas);

	const ctx = canvas.getContext('2d')!;
	const particles: Particle[] = [];

	for (let i = 0; i < PARTICLE_COUNT; i++) {
		const angle = Math.random() * Math.PI * 2;
		const speed = Math.random() * 8 + 4;
		particles.push({
			x: cx,
			y: cy,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed - 3,
			color: COLORS[Math.floor(Math.random() * COLORS.length)],
			size: Math.random() * 7 + 3,
			life: 1,
			decay: Math.random() * 0.008 + 0.003,
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
