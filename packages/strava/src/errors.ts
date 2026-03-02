export class StravaApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message?: string,
  ) {
    super(message ?? `Strava API error: ${status} ${statusText}`);
    this.name = 'StravaApiError';
  }
}

export class StravaRateLimitError extends StravaApiError {
  constructor(
    public usage: { shortTerm: number; daily: number },
    public limits: { shortTerm: number; daily: number },
  ) {
    super(429, 'Too Many Requests', 'Strava rate limit exceeded');
    this.name = 'StravaRateLimitError';
  }
}
