import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionUsage } from './types.js';

export interface ModelPrice {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}

const DEFAULT_PRICING: Record<string, ModelPrice> = {
  'claude-opus-4-20250514': { input: 15.00, output: 75.00, cache_read: 1.50, cache_write: 18.75 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00, cache_read: 0.30, cache_write: 3.75 },
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00, cache_read: 0.10, cache_write: 1.25 }
};

// Per-process cache for loaded pricing
let cachedPricing: Record<string, ModelPrice> | null = null;

export function loadPricing(): Record<string, ModelPrice> {
  // Return cached result if available
  if (cachedPricing !== null) {
    return cachedPricing;
  }

  // Start with default pricing
  const pricing = { ...DEFAULT_PRICING };

  // Try to load user overrides from ~/.noxdev/pricing.json
  try {
    const userConfigPath = path.join(os.homedir(), '.noxdev', 'pricing.json');

    if (fs.existsSync(userConfigPath)) {
      const configContent = fs.readFileSync(userConfigPath, 'utf-8');
      const userOverrides = JSON.parse(configContent);

      // Apply user overrides (user overrides win)
      Object.assign(pricing, userOverrides);
    }
  } catch (error) {
    // Ignore errors in loading user config, fall back to defaults
    // This handles cases where file exists but is malformed JSON, etc.
  }

  // Cache the result for the lifetime of this process
  cachedPricing = pricing;

  return pricing;
}

export function computeCostUsd(usage: SessionUsage): number {
  // Return 0 if model is null or not in pricing table
  if (usage.model === null) {
    return 0;
  }

  const pricing = loadPricing();
  const modelPrice = pricing[usage.model];

  if (!modelPrice) {
    // Model not found in pricing table - return 0 cost with warning comment
    // We prefer underreporting to guessing
    return 0;
  }

  // Calculate cost: (tokens * price_per_million) / 1_000_000
  const cost = (
    (usage.input_tokens * modelPrice.input) +
    (usage.output_tokens * modelPrice.output) +
    (usage.cache_read_tokens * modelPrice.cache_read) +
    (usage.cache_write_tokens * modelPrice.cache_write)
  ) / 1_000_000;

  // Round to 4 decimal places
  return Math.round(cost * 10000) / 10000;
}