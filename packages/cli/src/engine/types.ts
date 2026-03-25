import type Database from "better-sqlite3";
import type { ProjectConfig } from "../config/types.js";
import type { AuthResult } from "../auth/index.js";

export interface RunContext {
  projectId: string;
  projectConfig: ProjectConfig;
  worktreeDir: string;
  projectGitDir: string;
  gitTargetPath: string;
  runId: string;
  db: Database.Database;
  auth: AuthResult;
}

export interface TaskExecResult {
  taskId: string;
  title: string;
  status: string;
  exitCode: number | null;
  commitSha: string | null;
  durationSeconds: number;
  attempt: number;
}
