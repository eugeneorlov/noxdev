import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionUsage } from './types.js';

export function parseSessionUsage(jsonlPath: string): SessionUsage {
  // Initialize result with zeros
  const result: SessionUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    model: null
  };

  // If file doesn't exist, return zeros and model: null — don't throw
  if (!fs.existsSync(jsonlPath)) {
    return result;
  }

  try {
    // Read the file synchronously
    const content = fs.readFileSync(jsonlPath, 'utf-8');

    // Split on newlines, filter empty lines
    const lines = content.split('\n').filter(line => line.trim() !== '');

    for (const line of lines) {
      try {
        // Try JSON.parse in a try/catch (ignore malformed lines)
        const parsed = JSON.parse(line);

        // Look for a usage object at line.message?.usage OR line.usage
        const usage = parsed.message?.usage || parsed.usage;

        if (usage) {
          // Accumulate the four token counts. Missing fields default to 0
          result.input_tokens += usage.input_tokens || 0;
          result.output_tokens += usage.output_tokens || 0;
          result.cache_read_tokens += usage.cache_read_input_tokens || 0;
          result.cache_write_tokens += usage.cache_creation_input_tokens || 0;
        }

        // Track the model string from line.message?.model OR line.model — keep the last non-null value
        const model = parsed.message?.model || parsed.model;
        if (model) {
          result.model = model;
        }
      } catch (parseError) {
        // Ignore malformed lines
        continue;
      }
    }
  } catch (readError) {
    // If we can't read the file, return the default result
    return result;
  }

  return result;
}

export function findLatestSessionFile(worktreePath: string, afterTimestamp: number): string | null {
  try {
    // Encode the worktree path the same way Claude Code does: replace / with -, KEEPING the leading dash
    // Use path.resolve first, then replaceAll('/', '-')
    const resolvedPath = path.resolve(worktreePath);
    const encodedPath = resolvedPath.replaceAll('/', '-');

    // Build the projects dir: path.join(os.homedir(), '.claude', 'projects', encoded)
    const projectsDir = path.join(os.homedir(), '.claude', 'projects', encodedPath);

    // If dir doesn't exist, return null
    if (!fs.existsSync(projectsDir)) {
      return null;
    }

    // Read all *.jsonl files, filter to those with mtimeMs >= afterTimestamp
    const files = fs.readdirSync(projectsDir);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

    let latestFile: string | null = null;
    let latestMtime = -1;

    for (const file of jsonlFiles) {
      const fullPath = path.join(projectsDir, file);
      try {
        const stats = fs.statSync(fullPath);
        const mtimeMs = stats.mtimeMs;

        // Filter to those with mtimeMs >= afterTimestamp and find the highest
        if (mtimeMs >= afterTimestamp && mtimeMs > latestMtime) {
          latestMtime = mtimeMs;
          latestFile = fullPath;
        }
      } catch (statError) {
        // Skip files we can't stat
        continue;
      }
    }

    // Return the path of the one with the highest mtimeMs, or null if none match
    return latestFile;
  } catch (error) {
    // If anything goes wrong, return null
    return null;
  }
}