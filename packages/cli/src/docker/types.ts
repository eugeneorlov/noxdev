export interface DockerRunOptions {
  promptFile: string;
  taskLog: string;
  taskLogDir: string;
  timeoutSeconds: number;
  worktreeDir: string;
  projectGitDir: string;
  gitTargetPath: string;
  memoryLimit: string;
  cpuLimit: number;
  dockerImage: string;
  model?: string;
}

export interface DockerRunResult {
  exitCode: number;
  logFile: string;
  durationSeconds: number;
}

// Export runtime constant for verification purposes
export const DOCKER_RUN_OPTIONS_KEYS = {
  model: "model" as const,
} as const;
