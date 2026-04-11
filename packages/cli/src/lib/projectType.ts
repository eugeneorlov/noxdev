import { existsSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export interface ProjectType {
  packageManager: PackageManager;
  commandPrefix: string;
}

/**
 * Detects project type based on filesystem manifest files
 */
export function detectProjectType(repoPath: string): ProjectType {
  // Check for lock files in order of preference
  const lockFiles: Array<{ file: string; manager: PackageManager }> = [
    { file: "pnpm-lock.yaml", manager: "pnpm" },
    { file: "yarn.lock", manager: "yarn" },
    { file: "package-lock.json", manager: "npm" },
    { file: "bun.lockb", manager: "bun" },
  ];

  for (const { file, manager } of lockFiles) {
    if (existsSync(join(repoPath, file))) {
      return {
        packageManager: manager,
        commandPrefix: manager,
      };
    }
  }

  // Default to pnpm if no lock files found
  return {
    packageManager: "pnpm",
    commandPrefix: "pnpm",
  };
}

/**
 * Validates if a given package manager string is supported
 */
export function isValidPackageManager(manager: string): manager is PackageManager {
  return ["npm", "yarn", "pnpm", "bun"].includes(manager);
}

/**
 * Get command for a given script name using the detected package manager
 */
export function getCommand(
  projectType: ProjectType,
  scriptName: string,
): string {
  return `${projectType.commandPrefix} ${scriptName}`;
}

/**
 * Get project type with optional override
 */
export function getProjectType(repoPath: string, overrideType?: string): ProjectType {
  if (overrideType) {
    if (!isValidPackageManager(overrideType)) {
      throw new Error(`Invalid package manager type: ${overrideType}. Supported: npm, yarn, pnpm, bun`);
    }
    return {
      packageManager: overrideType,
      commandPrefix: overrideType,
    };
  }

  return detectProjectType(repoPath);
}