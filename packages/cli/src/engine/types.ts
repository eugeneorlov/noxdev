import type { Database } from "../db/connection.js";
import type { ProjectConfig, GlobalConfig } from "../config/types.js";
import type { AuthResult, AuthConfig } from "../auth/index.js";

export interface RunContext {
  projectId: string;
  projectConfig: ProjectConfig;
  globalConfig: GlobalConfig;
  worktreeDir: string;
  projectGitDir: string;
  gitTargetPath: string;
  runId: string;
  db: Database;
  auth: AuthResult;
  authConfig: AuthConfig;
}

export interface TaskExecResult {
  taskId: string;
  title: string;
  status: string;
  exitCode: number | null;
  commitSha: string | null;
  durationSeconds: number;
  attempt: number;
  auditAttempt?: number;
  gapAnalysisFile?: string | null;
}
