import { getDb } from '@web-runner/db/client';
import { users } from '@web-runner/db/schema';
import { eq, asc } from 'drizzle-orm';

const target = process.argv[2] || 'first';
const db = getDb();

let userId: number;
if (target === 'first') {
	const [first] = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
	if (!first) {
		console.error('No users found');
		process.exit(1);
	}
	userId = first.id;
} else {
	userId = Number(target);
	if (!Number.isFinite(userId) || userId <= 0 || userId !== Math.floor(userId)) {
		console.error(`Invalid user ID: ${target}`);
		process.exit(1);
	}
}

const result = await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId));
if (result.rowCount === 0) {
	console.error(`User ${userId} not found`);
	process.exit(1);
}
console.log(`User ${userId} promoted to admin`);
process.exit(0);
