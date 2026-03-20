import { eq, and, gte, inArray } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { activities } from '@web-runner/db/schema';

export interface MileageSummary {
	label: string;
	totalMeters: number;
	dailyMeters: number[];  // one entry per day in the period
	periodDays: number;     // total days in the period
	elapsedDays: number;    // days elapsed so far
	priorTotalMeters?: number;
}

export interface MileageSummaries {
	thisWeek: MileageSummary;
	last7Days: MileageSummary;
	month: MileageSummary;
	year: MileageSummary;
}

export async function getRunningMileageSummaries(userId: number): Promise<MileageSummaries> {
	const db = getDb();
	const now = new Date();

	// Start of current week (Monday)
	const weekStart = new Date(now);
	weekStart.setHours(0, 0, 0, 0);
	const dayOfWeek = weekStart.getDay();
	weekStart.setDate(weekStart.getDate() - ((dayOfWeek + 6) % 7));

	// Start of current month
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

	// Start of current year and previous year
	const yearStart = new Date(now.getFullYear(), 0, 1);
	const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);

	// Previous month
	const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

	// Fetch all running activities from prev year onward (covers all periods)
	const rows = await db
		.select({
			startDate: activities.startDate,
			distance: activities.distance,
		})
		.from(activities)
		.where(
			and(
				eq(activities.userId, userId),
				inArray(activities.sportType, ['run', 'trail_run']),
				gte(activities.startDate, prevYearStart),
				eq(activities.syncStatus, 'complete'),
			),
		);

	function sumRange(start: Date, end: Date): number {
		let total = 0;
		for (const row of rows) {
			const d = new Date(row.startDate);
			if (d >= start && d <= end) total += row.distance ?? 0;
		}
		return total;
	}

	function buildSummary(label: string, periodStart: Date, periodDays: number): MileageSummary {
		const elapsedDays = Math.floor((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
		const dailyMeters = new Array(Math.min(elapsedDays, periodDays)).fill(0);

		for (const row of rows) {
			const date = new Date(row.startDate);
			if (date < periodStart) continue;
			const dayIndex = Math.floor((date.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
			if (dayIndex >= 0 && dayIndex < dailyMeters.length) {
				dailyMeters[dayIndex] += row.distance ?? 0;
			}
		}

		return {
			label,
			totalMeters: dailyMeters.reduce((a, b) => a + b, 0),
			dailyMeters,
			periodDays,
			elapsedDays: Math.min(elapsedDays, periodDays),
		};
	}

	// Rolling last 7 days
	const last7Start = new Date(now);
	last7Start.setHours(0, 0, 0, 0);
	last7Start.setDate(last7Start.getDate() - 6);

	const isLeapYear = (now.getFullYear() % 4 === 0 && now.getFullYear() % 100 !== 0) || (now.getFullYear() % 400 === 0);
	const daysInYear = isLeapYear ? 366 : 365;
	const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

	const prevYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);

	// Previous week (Mon-Sun before current week)
	const prevWeekStart = new Date(weekStart);
	prevWeekStart.setDate(prevWeekStart.getDate() - 7);
	const prevWeekEnd = new Date(weekStart.getTime() - 1);

	// Previous rolling 7 days (the 7 days before the current last-7-days window)
	const prevLast7Start = new Date(last7Start);
	prevLast7Start.setDate(prevLast7Start.getDate() - 7);
	const prevLast7End = new Date(last7Start.getTime() - 1);

	const thisWeek = buildSummary('This Week', weekStart, 7);
	thisWeek.priorTotalMeters = sumRange(prevWeekStart, prevWeekEnd);

	const last7Days = buildSummary('Last 7 Days', last7Start, 7);
	last7Days.priorTotalMeters = sumRange(prevLast7Start, prevLast7End);

	const month = buildSummary('Month', monthStart, daysInMonth);
	month.priorTotalMeters = sumRange(prevMonthStart, prevMonthEnd);

	const year = buildSummary('Year', yearStart, daysInYear);
	year.priorTotalMeters = sumRange(prevYearStart, prevYearEnd);

	return { thisWeek, last7Days, month, year };
}
