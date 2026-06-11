import { describe, it, expect } from 'vitest';
import { calculateRemainingDays } from './date-utils';

describe('calculateRemainingDays', () => {
  it('returns 0 when endDate equals today', () => {
    const today = new Date(2026, 5, 11); // June 11
    const endDate = new Date(2026, 5, 11); // June 11
    expect(calculateRemainingDays(today, endDate)).toBe(0);
  });

  it('returns 0 when endDate is before today', () => {
    const today = new Date(2026, 5, 15); // June 15
    const endDate = new Date(2026, 5, 10); // June 10
    expect(calculateRemainingDays(today, endDate)).toBe(0);
  });

  it('counts from tomorrow through endDate inclusive', () => {
    // June 11 to June 30 = 19 days (June 12..30)
    const today = new Date(2026, 5, 11); // June 11
    const endDate = new Date(2026, 5, 30); // June 30
    expect(calculateRemainingDays(today, endDate)).toBe(19);
  });

  it('returns 1 when endDate is tomorrow', () => {
    const today = new Date(2026, 5, 11); // June 11
    const endDate = new Date(2026, 5, 12); // June 12
    expect(calculateRemainingDays(today, endDate)).toBe(1);
  });

  it('handles month boundaries correctly', () => {
    // Jan 29 to Jan 31 = 2 days (Jan 30, 31)
    const today = new Date(2026, 0, 29); // Jan 29
    const endDate = new Date(2026, 0, 31); // Jan 31
    expect(calculateRemainingDays(today, endDate)).toBe(2);
  });

  it('handles full month from day 1', () => {
    // June 1 to June 30 = 29 days (June 2..30)
    const today = new Date(2026, 5, 1); // June 1
    const endDate = new Date(2026, 5, 30); // June 30
    expect(calculateRemainingDays(today, endDate)).toBe(29);
  });
});

import * as fc from 'fast-check';

const FC_CONFIG = { numRuns: 100 };

describe('calculateRemainingDays - Property-Based Tests', () => {
  /**
   * Property 6: Remaining days calculation
   * For any pair (today, endDate) where endDate > today,
   * calculateRemainingDays(today, endDate) equals the number of days
   * from (today+1) through endDate inclusive.
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  it('Property 6: For endDate > today, result equals diffInDays(endDate, today)', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('2020-01-01'),
          max: new Date('2030-12-31'),
        }),
        fc.integer({ min: 1, max: 365 }),
        (today, daysAhead) => {
          const endDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() + daysAhead
          );

          const result = calculateRemainingDays(today, endDate);

          // Expected: number of days from (today+1) through endDate inclusive = daysAhead
          expect(result).toBe(daysAhead);
        }
      ),
      FC_CONFIG
    );
  });

  it('Property 6 (corollary): Result is always 0 when endDate <= today', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('2020-01-01'),
          max: new Date('2030-12-31'),
        }),
        fc.integer({ min: 0, max: 365 }),
        (today, daysBefore) => {
          const endDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() - daysBefore
          );

          const result = calculateRemainingDays(today, endDate);
          expect(result).toBe(0);
        }
      ),
      FC_CONFIG
    );
  });
});
