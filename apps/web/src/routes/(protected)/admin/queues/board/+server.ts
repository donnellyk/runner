import type { RequestHandler } from './$types';

const BULL_BOARD_URL = process.env.BULL_BOARD_URL || 'http://localhost:3001';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.isAdmin) {
		return new Response('Forbidden', { status: 403 });
	}

	const query = url.search;
	const target = `${BULL_BOARD_URL}/${query}`;

	let res: Response;
	try {
		res = await fetch(target);
	} catch {
		return new Response('Bull Board is not running. It is only available in production.', {
			status: 502,
			headers: { 'content-type': 'text/plain' },
		});
	}

	const body = await res.text();

	// Rewrite absolute paths in HTML so Bull Board's assets load through the proxy
	const rewritten = body.replace(/"\//g, '"/admin/queues/board/');

	const headers = new Headers();
	const contentType = res.headers.get('content-type');
	if (contentType) headers.set('content-type', contentType);

	return new Response(rewritten, { status: res.status, headers });
};
