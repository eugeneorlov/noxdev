import { formatCost } from '../lib/format';

export interface CostSummaryData {
  tokens: {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
  };
  api: {
    tasks: number;
    cost_usd: number;
  };
  max: {
    tasks: number;
    cost_usd_equivalent: number;
  };
  total_tasks: number;
}

interface CostSummaryProps {
  summary: CostSummaryData | null;
  loading: boolean;
}

// Helper function to format numbers with compact notation
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

export function CostSummary({ summary, loading }: CostSummaryProps) {
  if (loading) {
    return (
      <div className="rounded-lg border p-4 mb-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const totalCost = summary.api.cost_usd + summary.max.cost_usd_equivalent;
  const totalTokens = summary.tokens.input + summary.tokens.output;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
      <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
        Cost Summary
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {formatCost(totalCost, 'aggregate')}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Total Cost
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {summary.api.tasks + summary.max.tasks} tasks
          </div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {formatNumber(totalTokens)}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Total Tokens
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {summary.total_tasks} tasks
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-500 dark:text-gray-500 space-y-1">
        <div>Token-based cost. Max-mode tasks show equivalent API cost.</div>
        <div>Input + output. Cache tokens shown in task detail.</div>
      </div>
    </div>
  );
}