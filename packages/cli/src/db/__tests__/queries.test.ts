import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../migrate.js";
import {
  insertRun,
  updateRunFinished,
  insertTaskCache,
  insertTaskResult,
  updateMergeDecision,
  getLatestRun,
  getTaskResults,
  getPendingMerge,
  getProject,
  getAllProjects,
} from "../queries.js";

function createDb(): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function seedProject(db: InstanceType<typeof Database>, id = "proj-1") {
  db.prepare(
    `INSERT INTO projects (id, display_name, repo_path, worktree_path, branch)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, "Test Project", "/tmp/repo", "/tmp/wt", "main");
}

const RUN = {
  id: "run-1",
  projectId: "proj-1",
  startedAt: "2026-03-23T10:00:00Z",
  authMode: "max",
  totalTasks: 5,
  commitBefore: "abc123",
  logFile: "/tmp/run.log",
};

const TASK_RESULT = {
  runId: "run-1",
  taskId: "T1",
  title: "Implement parser",
  status: "completed",
  exitCode: 0,
  authMode: "max",
  criticMode: "review",
  attempt: 1,
  commitSha: "def456",
  startedAt: "2026-03-23T10:01:00Z",
  finishedAt: "2026-03-23T10:05:00Z",
  durationSeconds: 240,
  devLogFile: "/tmp/dev.log",
  criticLogFile: "/tmp/critic.log",
  diffFile: "/tmp/diff.patch",
};

describe("queries", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = createDb();
    seedProject(db);
  });

  it("insertRun + getLatestRun round-trip", () => {
    insertRun(db, RUN);
    const row = getLatestRun(db, "proj-1") as Record<string, unknown>;
    expect(row).not.toBeNull();
    expect(row.id).toBe("run-1");
    expect(row.project_id).toBe("proj-1");
    expect(row.started_at).toBe("2026-03-23T10:00:00Z");
    expect(row.auth_mode).toBe("max");
    expect(row.total_tasks).toBe(5);
    expect(row.commit_before).toBe("abc123");
    expect(row.log_file).toBe("/tmp/run.log");
    expect(row.status).toBe("running");
  });

  it("getLatestRun returns null when no runs exist", () => {
    expect(getLatestRun(db, "proj-1")).toBeNull();
  });

  it("insertTaskResult + getTaskResults round-trip", () => {
    insertRun(db, RUN);
    insertTaskResult(db, TASK_RESULT);

    const rows = getTaskResults(db, "run-1") as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.run_id).toBe("run-1");
    expect(r.task_id).toBe("T1");
    expect(r.title).toBe("Implement parser");
    expect(r.status).toBe("completed");
    expect(r.exit_code).toBe(0);
    expect(r.auth_mode).toBe("max");
    expect(r.critic_mode).toBe("review");
    expect(r.attempt).toBe(1);
    expect(r.commit_sha).toBe("def456");
    expect(r.duration_seconds).toBe(240);
    expect(r.dev_log_file).toBe("/tmp/dev.log");
    expect(r.critic_log_file).toBe("/tmp/critic.log");
    expect(r.diff_file).toBe("/tmp/diff.patch");
  });

  it("updateRunFinished updates status and counts", () => {
    insertRun(db, RUN);
    updateRunFinished(db, "run-1", {
      finishedAt: "2026-03-23T11:00:00Z",
      completed: 3,
      failed: 1,
      skipped: 1,
      status: "finished",
      commitAfter: "ghi789",
    });

    const row = getLatestRun(db, "proj-1") as Record<string, unknown>;
    expect(row.finished_at).toBe("2026-03-23T11:00:00Z");
    expect(row.completed).toBe(3);
    expect(row.failed).toBe(1);
    expect(row.skipped).toBe(1);
    expect(row.status).toBe("finished");
    expect(row.commit_after).toBe("ghi789");
  });

  it("updateMergeDecision sets decision and mergedAt", () => {
    insertRun(db, RUN);
    insertTaskResult(db, TASK_RESULT);

    const rows = getTaskResults(db, "run-1") as Array<Record<string, unknown>>;
    const taskResultId = rows[0].id as number;

    updateMergeDecision(db, taskResultId, "accepted", "2026-03-23T12:00:00Z");

    const updated = getTaskResults(db, "run-1") as Array<Record<string, unknown>>;
    expect(updated[0].merge_decision).toBe("accepted");
    expect(updated[0].merged_at).toBe("2026-03-23T12:00:00Z");
  });

  it("updateMergeDecision without mergedAt sets null", () => {
    insertRun(db, RUN);
    insertTaskResult(db, TASK_RESULT);

    const rows = getTaskResults(db, "run-1") as Array<Record<string, unknown>>;
    const taskResultId = rows[0].id as number;

    updateMergeDecision(db, taskResultId, "rejected");

    const updated = getTaskResults(db, "run-1") as Array<Record<string, unknown>>;
    expect(updated[0].merge_decision).toBe("rejected");
    expect(updated[0].merged_at).toBeNull();
  });

  it("getPendingMerge only returns pending rows", () => {
    insertRun(db, RUN);
    insertTaskResult(db, TASK_RESULT);
    insertTaskResult(db, { ...TASK_RESULT, taskId: "T2", title: "Second task" });

    const all = getTaskResults(db, "run-1") as Array<Record<string, unknown>>;
    // Accept the first one
    updateMergeDecision(db, all[0].id as number, "accepted", "2026-03-23T12:00:00Z");

    const pending = getPendingMerge(db, "run-1");
    expect(pending).toHaveLength(1);
    expect((pending[0] as Record<string, unknown>).task_id).toBe("T2");
  });

  it("getAllProjects with no runs returns projects with null run fields", () => {
    const rows = getAllProjects(db) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("proj-1");
    expect(rows[0].latest_run_id).toBeNull();
    expect(rows[0].latest_run_started_at).toBeNull();
    expect(rows[0].latest_run_status).toBeNull();
  });

  it("getAllProjects after insertRun returns project with latest run data", () => {
    insertRun(db, RUN);
    insertRun(db, {
      ...RUN,
      id: "run-2",
      startedAt: "2026-03-23T12:00:00Z",
    });

    const rows = getAllProjects(db) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].latest_run_id).toBe("run-2");
    expect(rows[0].latest_run_started_at).toBe("2026-03-23T12:00:00Z");
    expect(rows[0].latest_run_status).toBe("running");
    expect(rows[0].latest_run_total_tasks).toBe(5);
  });

  it("insertTaskCache inserts multiple tasks", () => {
    insertRun(db, RUN);
    insertTaskCache(db, "run-1", [
      {
        taskId: "T1",
        title: "First",
        files: "src/a.ts",
        verify: "pnpm test",
        critic: "review",
        spec: "Do the thing",
        statusBefore: "pending",
      },
      {
        taskId: "T2",
        title: "Second",
        files: "src/b.ts",
        verify: "pnpm test",
        critic: "strict",
        spec: "Do another thing",
        statusBefore: "pending",
      },
    ]);

    const rows = db.prepare(`SELECT * FROM tasks WHERE run_id = ?`).all("run-1") as Array<
      Record<string, unknown>
    >;
    expect(rows).toHaveLength(2);
    expect(rows[0].task_id).toBe("T1");
    expect(rows[0].spec).toBe("Do the thing");
    expect(rows[1].task_id).toBe("T2");
    expect(rows[1].critic).toBe("strict");
  });

  it("getProject returns project or null", () => {
    const proj = getProject(db, "proj-1") as Record<string, unknown>;
    expect(proj).not.toBeNull();
    expect(proj.display_name).toBe("Test Project");

    expect(getProject(db, "nonexistent")).toBeNull();
  });
});
