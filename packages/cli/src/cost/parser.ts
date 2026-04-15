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

// Container CWD as mounted by docker-run-{max,api}.sh
// Claude Code encodes this as the project directory key.
const CONTAINER_WORKSPACE = '/workspace';

export function findLatestSessionFile(afterTimestamp: number): string | null {
  const projectKey = CONTAINER_WORKSPACE.replaceAll('/', '-'); // "-workspace"
  const projectsDir = path.join(os.homedir(), '.claude', 'projects', projectKey);
  if (!fs.existsSync(projectsDir)) return null;

  const files = fs.readdirSync(projectsDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => {
      const full = path.join(projectsDir, f);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .filter(f => f.mtimeMs >= afterTimestamp)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files.length > 0 ? files[0].full : null;
}