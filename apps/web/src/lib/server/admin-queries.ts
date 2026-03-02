import { getDb } from '@web-runner/db/client';
import { users } from '@web-runner/db/schema';

export async function getUserOptions() {
	const db = getDb();
	return db
		.select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
		.from(users)
		.orderBy(users.id);
}
