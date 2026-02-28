import { describe, expect, it } from 'vitest';
import { APP_NAME, DEFAULT_TIMEZONE } from '../index.js';

describe('shared constants', () => {
  it('exports APP_NAME', () => {
    expect(APP_NAME).toBe('web-runner');
  });

  it('exports DEFAULT_TIMEZONE', () => {
    expect(DEFAULT_TIMEZONE).toBe('UTC');
  });
});
