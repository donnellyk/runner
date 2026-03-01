import { defineProject } from 'vitest/config';
import path from 'node:path';

export default defineProject({
	test: {
		name: 'web',
		alias: {
			'$lib': path.resolve(__dirname, 'src/lib'),
		},
	},
});
