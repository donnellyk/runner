import readline from 'node:readline';
import { getDb } from '@web-runner/db/client';
import { activities, users } from '@web-runner/db/schema';
import { eq, asc, sql } from 'drizzle-orm';

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

const [user] = await db
	.select({ firstName: users.firstName, lastName: users.lastName })
	.from(users)
	.where(eq(users.id, userId));

if (!user) {
	console.error(`User ${userId} not found`);
	process.exit(1);
}

const [{ count }] = await db
	.select({ count: sql<number>`count(*)` })
	.from(activities)
	.where(eq(activities.userId, userId));

const total = Number(count);
if (total === 0) {
	console.log(`No activities found for ${user.firstName} ${user.lastName} (id: ${userId})`);
	process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const answer = await new Promise<string>((resolve) => {
	rl.question(
		`Delete ${total} activities for ${user.firstName} ${user.lastName} (id: ${userId})? [y/N] `,
		resolve,
	);
});
rl.close();

if (answer.toLowerCase() !== 'y') {
	console.log('Aborted');
	process.exit(0);
}

await db.delete(activities).where(eq(activities.userId, userId));
console.log(`Deleted ${total} activities (laps, streams, segments cascaded)`);
process.exit(0);
