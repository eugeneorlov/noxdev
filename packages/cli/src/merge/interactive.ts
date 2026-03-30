import type Database from "better-sqlite3";
import { execSync } from "node:child_process";
import { getLatestRun, updateMergeDecision } from "../db/queries.js";

export interface MergeCandidate {
  taskResultId: number;
  taskId: string;
  title: string;
  status: string;
  commitSha: string;
  diffFile: string | null;
}

export interface MergeDecision {
  taskResultId: number;
  taskId: string;
  decision: "approved" | "rejected" | "skipped";
}

interface TaskResultRow {
  id: number;
  task_id: string;
  title: string;
  status: string;
  commit_sha: string | null;
  diff_file: string | null;
  merge_decision: string;
}

interface RunRow {
  id: string;
}

export function getMergeCandidates(
  db: Database.Database,
  projectId: string,
): MergeCandidate[] {
  const run = getLatestRun(db, projectId) as RunRow | null;
  if (!run) return [];

  const rows = db
    .prepare(
      `SELECT id, task_id, title, status, commit_sha, diff_file
       FROM task_results
       WHERE run_id = ?
         AND UPPER(status) IN ('COMPLETED', 'COMPLETED_RETRY')
         AND LOWER(merge_decision) = 'pending'
         AND commit_sha IS NOT NULL`,
    )
    .all(run.id) as TaskResultRow[];

  return rows.map((r) => ({
    taskResultId: r.id,
    taskId: r.task_id,
    title: r.title,
    status: r.status,
    commitSha: r.commit_sha!,
    diffFile: r.diff_file,
  }));
}

export function getAutoApprovedTasks(
  db: Database.Database,
  projectId: string,
): MergeCandidate[] {
  const run = getLatestRun(db, projectId) as RunRow | null;
  if (!run) return [];

  const rows = db
    .prepare(
      `SELECT id, task_id, title, status, commit_sha, diff_file
       FROM task_results
       WHERE run_id = ?
         AND UPPER(status) IN ('COMPLETED', 'COMPLETED_RETRY')
         AND LOWER(merge_decision) = 'approved'
         AND commit_sha IS NOT NULL`,
    )
    .all(run.id) as TaskResultRow[];

  return rows.map((r) => ({
    taskResultId: r.id,
    taskId: r.task_id,
    title: r.title,
    status: r.status,
    commitSha: r.commit_sha!,
    diffFile: r.diff_file,
  }));
}

export function getDiffStats(worktreeDir: string, commitSha: string): string {
  return execSync(`git show --stat --format="" ${commitSha}`, {
    cwd: worktreeDir,
    encoding: "utf-8",
  }).trim();
}

export function getFullDiff(worktreeDir: string, commitSha: string): string {
  return execSync(`git show ${commitSha}`, {
    cwd: worktreeDir,
    encoding: "utf-8",
  });
}

export function applyMergeDecisions(
  db: Database.Database,
  worktreeDir: string,
  projectGitDir: string,
  decisions: MergeDecision[],
): { merged: number; rejected: number; skipped: number } {
  const now = new Date().toISOString();
  let merged = 0;
  let rejected = 0;
  let skipped = 0;

  // Look up commit SHAs for rejected decisions
  const candidates = getMergeCandidatesForDecisions(db, decisions);

  for (const d of decisions) {
    if (d.decision === "rejected") {
      const candidate = candidates.get(d.taskResultId);
      if (candidate) {
        execSync(`git revert --no-commit ${candidate.commitSha}`, {
          cwd: worktreeDir,
        });
        execSync(
          `git commit -m "noxdev: revert ${d.taskId} (rejected in merge review)"`,
          { cwd: worktreeDir },
        );
      }
      updateMergeDecision(db, d.taskResultId, "rejected", now);
      rejected++;
    } else if (d.decision === "approved") {
      updateMergeDecision(db, d.taskResultId, "approved", now);
      merged++;
    } else {
      // skipped — leave merge_decision as pending
      skipped++;
    }
  }

  // Merge worktree branch into main if any approved
  if (merged > 0) {
    const run = getRunForDecisions(db, decisions, candidates);
    const branch = getBranchFromWorktree(worktreeDir);
    const runId = run?.id ?? "unknown";
    execSync(
      `git merge ${branch} -m "noxdev: merge ${merged} approved tasks from run ${runId}"`,
      { cwd: projectGitDir },
    );
  }

  return { merged, rejected, skipped };
}

function getMergeCandidatesForDecisions(
  db: Database.Database,
  decisions: MergeDecision[],
): Map<number, { commitSha: string; runId: string }> {
  const result = new Map<number, { commitSha: string; runId: string }>();
  for (const d of decisions) {
    const row = db
      .prepare(`SELECT commit_sha, run_id FROM task_results WHERE id = ?`)
      .get(d.taskResultId) as
      | { commit_sha: string; run_id: string }
      | undefined;
    if (row) {
      result.set(d.taskResultId, {
        commitSha: row.commit_sha,
        runId: row.run_id,
      });
    }
  }
  return result;
}

function getRunForDecisions(
  db: Database.Database,
  decisions: MergeDecision[],
  candidates: Map<number, { commitSha: string; runId: string }>,
): { id: string } | null {
  for (const d of decisions) {
    const c = candidates.get(d.taskResultId);
    if (c) {
      return db.prepare(`SELECT id FROM runs WHERE id = ?`).get(c.runId) as {
        id: string;
      } | null;
    }
  }
  return null;
}

function getBranchFromWorktree(worktreeDir: string): string {
  return execSync("git rev-parse --abbrev-ref HEAD", {
    cwd: worktreeDir,
    encoding: "utf-8",
  }).trim();
}
