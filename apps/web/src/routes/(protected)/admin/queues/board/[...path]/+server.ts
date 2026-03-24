import type { RequestHandler } from './$types';

const BULL_BOARD_URL = process.env.BULL_BOARD_URL || 'http://localhost:3001';

async function proxy(request: Request, locals: App.Locals, path: string, query: string): Promise<Response> {
	if (!locals.user?.isAdmin) {
		return new Response('Forbidden', { status: 403 });
	}

	// Sanitize path: reject traversal attempts
	if (path.includes('..') || path.includes('//')) {
		return new Response('Bad Request', { status: 400 });
	}

	const target = `${BULL_BOARD_URL}/${path}${query}`;

	let res: Response;
	try {
		res = await fetch(target, {
			method: request.method,
			headers: { 'content-type': request.headers.get('content-type') || '' },
			body: request.method !== 'GET' ? request.body : undefined,
			// @ts-expect-error duplex required for streaming body
			duplex: request.method !== 'GET' ? 'half' : undefined,
		});
	} catch {
		return new Response('Bull Board is not running.', {
			status: 502,
			headers: { 'content-type': 'text/plain' },
		});
	}

	const body = await res.arrayBuffer();
	const headers = new Headers();
	const contentType = res.headers.get('content-type');
	if (contentType) headers.set('content-type', contentType);
	const cacheControl = res.headers.get('cache-control');
	if (cacheControl) headers.set('cache-control', cacheControl);

	return new Response(body, { status: res.status, headers });
}

export const GET: RequestHandler = async ({ request, params, url, locals }) => {
	return proxy(request, locals, params.path || '', url.search);
};

export const POST: RequestHandler = async ({ request, params, url, locals }) => {
	return proxy(request, locals, params.path || '', url.search);
};

export const PUT: RequestHandler = async ({ request, params, url, locals }) => {
	return proxy(request, locals, params.path || '', url.search);
};
