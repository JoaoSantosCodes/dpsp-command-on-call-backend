/**
 * Date utilities for the Command Center backend.
 */

/**
 * Calculate remaining days from tomorrow through endDate (inclusive).
 * Counts days from (today + 1) through endDate.
 * If endDate <= today, returns 0.
 *
 * @param today - The current date (time portion is ignored)
 * @param endDate - The end date to count through (inclusive)
 * @returns Number of remaining days (0 if endDate is today or earlier)
 */
export function calculateRemainingDays(today: Date, endDate: Date): number {
  // Normalize both dates to midnight to ignore time components
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  // If endDate is today or earlier, no remaining days
  if (endMidnight.getTime() <= todayMidnight.getTime()) {
    return 0;
  }

  // Count from tomorrow through endDate inclusive
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffMs = endMidnight.getTime() - todayMidnight.getTime();
  const diffDays = Math.round(diffMs / msPerDay);

  // diffDays is the gap from today to endDate.
  // Since we start counting from tomorrow (today+1) through endDate inclusive,
  // the count is exactly diffDays.
  return diffDays;
}
