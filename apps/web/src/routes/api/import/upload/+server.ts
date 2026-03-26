import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireApiUser } from '$lib/server/validation';
import { getBulkImportQueue } from '$lib/server/queue';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

export const PUT: RequestHandler = async ({ request, locals }) => {
	const user = requireApiUser(locals);

	const contentLength = Number(request.headers.get('content-length') || 0);
	if (contentLength > MAX_UPLOAD_SIZE) {
		return json({ error: 'File too large (max 2GB)' }, { status: 400 });
	}

	if (!request.body) {
		return json({ error: 'No body' }, { status: 400 });
	}

	const importBase = process.env.IMPORT_DIR || join(tmpdir(), 'web-runner-imports');
	const uploadDir = join(importBase, String(user.id));
	await mkdir(uploadDir, { recursive: true });

	const filePath = join(uploadDir, `${randomUUID()}.zip`);

	// Stream the body directly to disk without buffering in memory
	let bytesWritten = 0;
	const nodeStream = Readable.fromWeb(request.body as import('stream/web').ReadableStream);
	const writeStream = createWriteStream(filePath);

	try {
		await pipeline(
			nodeStream,
			async function* (source) {
				for await (const chunk of source) {
					bytesWritten += chunk.length;
					if (bytesWritten > MAX_UPLOAD_SIZE) {
						throw new Error('File too large');
					}
					yield chunk;
				}
			},
			writeStream,
		);
	} catch (err) {
		// Clean up partial file
		try { const { rm } = await import('node:fs/promises'); await rm(filePath, { force: true }); } catch { /* ignore */ }
		const message = err instanceof Error && err.message === 'File too large'
			? 'File too large (max 2GB)'
			: 'Upload failed';
		return json({ error: message }, { status: 400 });
	}

	const queue = getBulkImportQueue();
	const job = await queue.add('bulk-import', {
		type: 'bulk-import' as const,
		userId: user.id,
		filePath,
	});

	return json({ jobId: job.id });
};
