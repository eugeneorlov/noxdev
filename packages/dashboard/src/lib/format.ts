/**
 * Shared formatting utilities for the noxdev dashboard
 */

/**
 * Unified cost formatting function with mode parameter
 * @param cost The cost value in USD (can be null)
 * @param mode The formatting mode ('basic' | 'display' | 'props' | 'currency')
 * @param options Formatting options
 * @returns Formatted cost as string, props object, or null depending on mode
 */
export function formatCost(
  cost: number | null,
  mode: 'basic' | 'display' | 'props' | 'currency' = 'basic',
  options: {
    precision?: number;
    authMode?: string | null;
    minDecimals?: number;
    maxDecimals?: number;
  } = {}
): string | { text: string; className: string; title?: string } | null {
  // Handle null/zero cost based on mode
  if (cost === null || cost === 0) {
    switch (mode) {
      case 'basic':
        return '$0.00';
      case 'display':
        return '—';
      case 'props':
        return null;
      case 'currency':
        return '$0.00';
    }
  }

  const { precision = 3, authMode, minDecimals = 2, maxDecimals = 4 } = options;

  switch (mode) {
    case 'basic':
      return `$${cost!.toFixed(precision)}`;

    case 'display': {
      const formattedCost = `$${cost!.toFixed(precision)}`;
      if (authMode === 'api') {
        return `${formattedCost} (api)`;
      } else if (authMode === 'max') {
        return `${formattedCost} equivalent (max)`;
      }
      return formattedCost;
    }

    case 'props': {
      if (authMode === 'api') {
        return {
          text: `$${cost!.toFixed(precision)}`,
          className: "text-xs font-mono text-gray-600 dark:text-gray-400"
        };
      } else if (authMode === 'max') {
        return {
          text: `$${cost!.toFixed(precision)}*`,
          className: "text-xs font-mono text-gray-500 dark:text-gray-500",
          title: "Max equivalent API cost"
        };
      }
      return null;
    }

    case 'currency':
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
        style: 'currency',
        currency: 'USD',
      }).format(cost!);

    default:
      return `$${cost!.toFixed(precision)}`;
  }
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

