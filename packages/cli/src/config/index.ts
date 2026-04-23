import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { GlobalConfig, ProjectConfig } from "./types.js";

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  accounts: {
    max: {
      preferred: true,
      rate_limit_ceiling: 80,
    },
    api: {
      fallback: true,
      daily_cap_usd: 5,
      model: "claude-sonnet-4-6",
    },
    gemini: {
      fallback: false,
      model: "gemini-1.5-pro",
    },
  },
  safety: {
    auto_push: false,
    max_retries_per_task: 3,
    circuit_breaker_threshold: 5,
  },
  secrets: {
    provider: "age",
    global: "",
    age_key: "",
  },
};

const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  project: "",
  display_name: "",
  test_command: "pnpm test",
  build_command: "pnpm build",
  lint_command: "pnpm lint",
  docker: {
    memory: "4g",
    cpus: 2,
    timeout_minutes: 30,
  },
  secrets: "",
  tasks_file: "TASKS.md",
  critic_default: "strict",
  push_default: "never",
};

function deepMerge<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Record<string, unknown>,
): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    const val = overrides[key];
    const def = (defaults as Record<string, unknown>)[key];
    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      def !== null &&
      typeof def === "object" &&
      !Array.isArray(def)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        def as Record<string, unknown>,
        val as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key] = val;
    }
  }
  return result;
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw new Error(
      `Failed to parse config at ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function loadGlobalConfig(): GlobalConfig {
  const configPath = join(homedir(), ".noxdev", "config.json");
  const overrides = readJsonFile(configPath);
  if (!overrides) {
    return { ...DEFAULT_GLOBAL_CONFIG };
  }
  return deepMerge(DEFAULT_GLOBAL_CONFIG as unknown as Record<string, unknown>, overrides) as unknown as GlobalConfig;
}

export function loadProjectConfig(projectPath: string): ProjectConfig {
  const configPath = join(projectPath, ".noxdev", "config.json");
  const overrides = readJsonFile(configPath);
  if (!overrides) {
    return { ...DEFAULT_PROJECT_CONFIG };
  }
  return deepMerge(DEFAULT_PROJECT_CONFIG as unknown as Record<string, unknown>, overrides) as unknown as ProjectConfig;
}

export type { GlobalConfig, ProjectConfig } from "./types.js";
