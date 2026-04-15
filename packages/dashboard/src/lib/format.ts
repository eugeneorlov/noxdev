/**
 * Shared formatting utilities
 */

/**
 * Format a cost value as a currency string
 * @param cost The cost value in USD (can be null)
 * @param mode The formatting mode ('aggregate' | 'detail')
 * @returns Formatted currency string
 */
export function formatCost(cost: number | null, mode: 'aggregate' | 'detail' = 'aggregate'): string {
  if (cost === null) return '—';

  if (mode === 'aggregate') {
    return `$${cost.toFixed(2)}`;
  } else if (mode === 'detail') {
    return `$${cost.toFixed(4)}`;
  }

  return `$${cost.toFixed(2)}`;
}

/**
 * Format a number with thousand separators
 * @param num The number to format (can be null)
 * @returns Formatted number string with commas
 */
export function formatNumber(num: number | null): string {
  if (num === null) return '—';
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Format duration in seconds as "Mm Ss" format
 * @param durationSeconds The duration in seconds (can be null)
 * @returns Formatted duration string
 */
export function formatDurationSeconds(durationSeconds: number | null): string {
  if (durationSeconds === null || durationSeconds === undefined) return '—';

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}