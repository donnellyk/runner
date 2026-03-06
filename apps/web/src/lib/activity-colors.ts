export function sportColor(sportType: string | null | undefined): string {
	switch (sportType) {
		case 'run':       return '#6366f1';
		case 'trail_run': return '#f59e0b';
		case 'ride':      return '#3b82f6';
		case 'swim':      return '#06b6d4';
		case 'walk':      return '#94a3b8';
		case 'hike':      return '#22c55e';
		default:          return '#a1a1aa';
	}
}

interface WorkoutBadge {
	label: string;
	bg: string;
	fg: string;
}

export function workoutBadge(workoutType: string | null | undefined): WorkoutBadge | null {
	switch (workoutType) {
		case 'race':     return { label: 'Race',     bg: '#fef3c7', fg: '#92400e' };
		case 'long_run': return { label: 'Long Run', bg: '#dbeafe', fg: '#1e40af' };
		case 'workout':  return { label: 'Workout',  bg: '#ffedd5', fg: '#9a3412' };
		default:         return null;
	}
}
