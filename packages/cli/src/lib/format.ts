/**
 * Shared formatting utilities for the noxdev CLI
 */

/**
 * Format a cost value as a currency string
 * @param cost The cost value in USD (can be null)
 * @param precision Number of decimal places (default: 2)
 * @returns Formatted currency string (e.g., "$1.23", "$0.00")
 */
export function formatCost(cost: number | null, precision: number = 2): string {
  if (cost === null || cost === 0) return '$0.00';
  return `$${cost.toFixed(precision)}`;
}

/**
 * Format a number with thousand separators
 * @param num The number to format (can be null)
 * @returns Formatted number string with commas
 */
export function formatNumber(num: number | null): string {
  if (num === null) return '0';
  return new Intl.NumberFormat('en-US').format(num);
}