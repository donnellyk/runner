import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	return {
		darkMap: cookies.get('darkMap') === 'true',
	};
};
