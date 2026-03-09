# Chart Sampling & Smoothing

Activity stream data from Strava is recorded at 1 Hz (one sample per second), giving ~3,600 points for a 1-hour run and ~15,000 for a marathon. Rendering all points in an SVG polyline is wasteful and produces a visually noisy chart. This document describes the approach used and alternatives considered.

## Current Approach

### Downsampling: Bucket Averaging

**File:** `apps/web/src/lib/sampling.ts` — `bucketAvgIndices(ys, target)`

The stream is divided into `target` equal-sized buckets. For each bucket, the mean of all values is computed and the point whose value is closest to that mean is selected.

This is preferable to simple stride sampling (pick every Nth point) because:
- A single spike (GPS glitch, brief stop) only pulls the bucket mean slightly, so the selected point tends to be a representative value rather than the spike itself
- The output is therefore cleaner without needing a separate smoothing pass

The default target is **500 points**, adjustable via the sample rate slider in the UI.

### Smoothing: Centered Moving Average

**File:** `apps/web/src/lib/components/ActivityChart.svelte` — `smoothingWindow` prop

After downsampling, a centered moving average with half-width `smoothingWindow` is applied inside the chart component. The default window is **2** (averages 5 points: i-2 through i+2).

Key behaviors:
- Paused points (velocity < pause threshold) are excluded from the averaging window so they don't bleed into adjacent running segments
- `smoothingWindow = 0` disables smoothing entirely
- The y-axis bounds are computed from the smoothed, non-paused values

### Pause Detection

**File:** `apps/web/src/routes/(protected)/(app)/activities/[id]/+page.svelte`

Points where `velocity_smooth < pauseThreshold` (default **1.0 m/s**, ~26:50/mi) are marked as paused. This threshold catches both complete stops and the transition ramp-up/ramp-down points where Strava's velocity smoothing hasn't fully registered the change.

The pause mask is used to:
1. Exclude paused points from y-axis bounds computation (prevents chart scale being blown out by near-zero velocity pace values)
2. Exclude paused points from the moving average window (prevents bleed at transitions)
3. Render a dashed vertical line at the midpoint of each pause gap

Note: `velocity_smooth` from Strava is already a smoothed signal — applying our own moving average on top is double-smoothing, hence keeping the window small (2).

---

## Alternatives Considered

### Stride Sampling
Pick every Nth point (`Math.round(i * stride)`). Simple and fast but has no spike resistance — a single bad GPS point that happens to fall on a stride boundary gets included as-is.

### Bucket Median
Same bucket structure as bucket averaging, but select the point closest to the bucket median rather than mean. More outlier-resistant than mean (a spike doesn't move the median at all). In practice, the difference from bucket averaging is minimal for this data, and the sort required per bucket makes it slightly more expensive. Not worth the added complexity.

### LTTB (Largest Triangle Three Buckets)
Sveinn Steinarsson's algorithm selects the point per bucket that maximizes the triangle area formed with the previous selected point and the average of the next bucket. Preserves the visual shape of the signal better than stride sampling.

**Why we didn't use it:** LTTB optimizes for visual significance, which includes spikes. A pace spike (brief stop, GPS glitch) forms a large triangle and gets preferentially selected, making the chart look busier than stride or bucket averaging.

### Douglas-Peucker Simplification
Recursively removes points that fall within `epsilon` of the line between their neighbors (vertical distance variant for time series). Adaptive — flat sections get fewer points, variable sections get more. Output count varies with signal complexity and epsilon, so the sample rate slider doesn't apply directly.

Could be useful as a post-processing step on the smoothed line to clean up any remaining noise, but the bucket averaging + small moving average already produces clean enough output without the complexity of tuning epsilon.

### Savitzky-Golay / LOWESS / Kalman
More sophisticated curve-fitting approaches. LOWESS and Savitzky-Golay preserve peaks better than a simple moving average. Kalman is optimal if the GPS noise model is known. All are significantly more complex to implement correctly and overkill given that `velocity_smooth` is already pre-smoothed by Strava.
