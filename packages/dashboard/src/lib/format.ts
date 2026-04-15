/**
 * Shared formatting utilities for the noxdev dashboard
 */

/**
 * Format a cost value as a currency string
 * @param cost The cost value in USD (can be null)
 * @param precision Number of decimal places (default: 3)
 * @returns Formatted currency string (e.g., "$1.234", "$0.00")
 */
export function formatCost(cost: number | null, precision: number = 3): string {
  if (cost === null || cost === 0) return '$0.00';
  return `$${cost.toFixed(precision)}`;
}

/**
 * Format a cost value for display with auth mode context
 * @param cost The cost value in USD (can be null)
 * @param authModeValue The auth mode ('api' or 'max')
 * @param precision Number of decimal places (default: 4)
 * @returns Formatted string with context
 */
export function formatCostDisplay(cost: number | null, authModeValue: string | null, precision: number = 4): string {
  if (!cost) return '—';

  const formattedCost = `$${cost.toFixed(precision)}`;
  if (authModeValue === 'api') {
    return `${formattedCost} (api)`;
  } else if (authModeValue === 'max') {
    return `${formattedCost} equivalent (max)`;
  }
  return formattedCost;
}

/**
 * Get cost formatting props for JSX elements
 * @param cost The cost value in USD (can be null)
 * @param authModeValue The auth mode ('api' or 'max')
 * @param precision Number of decimal places (default: 3)
 * @returns Object with text and styling props, or null if no cost to display
 */
export function getCostProps(cost: number | null, authModeValue: string | null, precision: number = 3): {
  text: string;
  className: string;
  title?: string;
} | null {
  if (!cost || cost === 0) return null;

  if (authModeValue === 'api') {
    return {
      text: `$${cost.toFixed(precision)}`,
      className: "text-xs font-mono text-gray-600 dark:text-gray-400"
    };
  } else if (authModeValue === 'max') {
    return {
      text: `$${cost.toFixed(precision)}*`,
      className: "text-xs font-mono text-gray-500 dark:text-gray-500",
      title: "Max equivalent API cost"
    };
  }

  return null;
}

/**
 * Format a number with thousand separators using Intl.NumberFormat
 * @param num The number to format (can be null)
 * @returns Formatted number string with separators
 */
export function formatNumber(num: number | null): string {
  if (num === null || num === undefined) return '—';
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Format cost using Intl.NumberFormat with flexible decimal places
 * @param cost The cost value in USD
 * @param minDecimals Minimum decimal places (default: 2)
 * @param maxDecimals Maximum decimal places (default: 4)
 * @returns Formatted currency string
 */
export function formatCostIntl(cost: number, minDecimals: number = 2, maxDecimals: number = 4): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals
  }).format(cost);
}