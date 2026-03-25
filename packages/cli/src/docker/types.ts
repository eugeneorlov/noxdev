export interface DockerRunOptions {
  promptFile: string;
  taskLog: string;
  timeoutSeconds: number;
  worktreeDir: string;
  projectGitDir: string;
  gitTargetPath: string;
  memoryLimit: string;
  cpuLimit: number;
  dockerImage: string;
}

export interface DockerRunResult {
  exitCode: number;
  logFile: string;
  durationSeconds: number;
}
