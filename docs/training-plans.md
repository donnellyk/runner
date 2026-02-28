# Training Plans

## Overview
Users can define, import, and follow structured training plans anchored to a target race date. Plans are user-specific — there is no global plan library. This avoids copyright issues with published plans (Pfitzinger, Hanson, Daniels, etc.) and keeps the data model simple.

## Plan Definition (YAML)

Plans are defined in YAML and imported into the app. Users create these by hand or through a future import utility (e.g., from a photo of a book page). Imports are validated against a Zod schema defined in `packages/shared`, which provides typed plan objects and structured error messages for malformed input.

### Structure
- A plan is a list of **weeks**, numbered relative to race day (week N = race week)
- Each week contains a list of **workouts**
- Each workout has a **default day assignment** (1-7) but can be freely reordered in the UI via drag and drop

### Workout Format

Workouts are defined simply — a top-level distance and effort, with optional **targets** for specific sub-sections of the workout. There is no need to define the entire workout as a series of segments (warmup/cooldown/intervals).

#### Simple workout:
```yaml
- day: 1
  name: "Recovery"
  distance: 5mi
  effort: easy
```

#### Workout with a target:
```yaml
- day: 3
  name: "LT Run"
  distance: 8-9mi
  targets:
    - duration: 20-30min
      effort: LT
```

#### Structured intervals:
```yaml
- day: 5
  name: "VO2max Intervals"
  distance: 8mi
  targets:
    - type: interval
      repeat: 6
      distance: 800m
      effort: VO2max
```

### Full plan example:
```yaml
name: "Pfitz 18/55"
weeks: 18
workouts:
  - week: 1
    days:
      - day: 1
        name: "Recovery"
        distance: 5mi
        effort: easy
      - day: 3
        name: "LT Run"
        distance: 9mi
        targets:
          - duration: 20min
            effort: LT
      - day: 6
        name: "Long Run"
        distance: 14mi
        effort: GA
  # ... remaining weeks
```

## Effort Zones

Effort references in plans (easy, GA, LT, marathon pace, VO2max, etc.) map to **user-defined zones** stored in the user profile. Each zone has a name and corresponding pace range and/or HR range.

Example user zone configuration:
- **easy**: slower than 8:30/mi, HR < 140
- **GA**: 7:45-8:15/mi, HR 140-155
- **LT**: 6:40-7:00/mi, HR 165-175
- **marathon pace**: 7:10-7:20/mi, HR 155-165
- **VO2max**: 5:40-6:00/mi, HR 175+

Zones can be updated over the course of a training cycle as fitness changes. The plan YAML references zone names, not explicit pace/HR values, keeping plans portable and targets personal.

## Race Day Anchoring

- Plans are N weeks long, with week N being race week
- User inputs a target race date
- The app calculates the start date by counting backwards
- If the calculated start date is in the past, the app warns the user and allows jumping into the plan mid-cycle

## Active Plan Lifecycle

- **One active plan at a time** per user
- While active, the current week view is anchored to today's date
- After race day, the plan auto-archives
- Archived plans remain viewable for historical reference alongside their matched activities

## Activity Matching

When a new Strava activity arrives via webhook, the app attempts to match it to an unmatched planned workout for the current week.

### Matching signals
- **Day proximity** — how close is the activity date to the planned day?
- **Distance proximity** — does the activity distance fall within the planned range?
- **Workout type** — does the Strava `workout_type` tag (race, long run, workout) align with the plan?

### Matching behavior
1. New activity arrives
2. App evaluates unmatched planned workouts for the current week
3. Candidates scored by distance proximity, day proximity, and workout type alignment
4. **High confidence**: auto-link, user can override
5. **Low confidence / ambiguous**: surface as "did you mean this workout?" for user confirmation
6. User can always manually link or unlink activities from planned workouts

This system will be heuristic and imperfect — the user override is the escape valve. Matching logic can be refined over time as usage data accumulates.

## Workout Scoring

Lower priority than activity matching, but designed to use streams data from the start.

### Dimensions
- **Completion** — did the workout happen? (binary, determined by activity matching)
- **Distance compliance** — percentage of planned distance completed
- **Target compliance** — did the activity streams contain a sustained effort matching the planned targets?

### Target compliance analysis
When a workout has targets (e.g., "20-30min at LT"), the app analyzes the matched activity's streams data to:
1. Identify segments where pace/HR falls within the user's defined zone for the target effort
2. Measure the duration/distance of those segments
3. Score compliance (e.g., "28 min at LT pace out of 20-30min target — 100%")

This requires smoothing of GPS/pace data (noise, stops at intersections) and tolerance bands around zone boundaries. Implementation details to be determined during development.

## Priority / Phasing

1. **YAML import and plan management** — define plans, anchor to race date, weekly view
2. **Activity matching** — auto-match with user confirmation (primary daily utility)
3. **Workout scoring** — streams-based target analysis (build right or not at all)
