import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../../db/migrate.js";
import {
  insertRun,
  updateRunFinished,
  insertTaskResult,
  insertTaskCache,
} from "../../db/queries.js";
import { showTaskLog } from "../log.js";

function createDb(): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function seedProject(
  db: InstanceType<typeof Database>,
  id = "proj-1",
  displayName = "Test Project",
) {
  db.prepare(
    `INSERT INTO projects (id, display_name, repo_path, worktree_path, branch)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, displayName, "/tmp/repo", "/tmp/wt", "main");
}

const TASK_DEFAULTS = {
  exitCode: 0,
  authMode: "max",
  criticMode: "review",
  pushMode: "auto",
  attempt: 1,
  devLogFile: null,
  criticLogFile: null,
  diffFile: null,
};

describe("log command", () => {
  let db: InstanceType<typeof Database>;
  let logs: string[];

  beforeEach(() => {
    db = createDb();
    seedProject(db);
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows all fields for a single execution", () => {
    insertRun(db, {
      id: "run-1",
      projectId: "proj-1",
      startedAt: "2026-03-23T10:00:00",
      authMode: "max",
      totalTasks: 1,
      commitBefore: "abc123",
      logFile: "/tmp/run.log",
    });
    updateRunFinished(db, "run-1", {
      finishedAt: "2026-03-23T11:00:00",
      completed: 1,
      failed: 0,
      skipped: 0,
      status: "finished",
      commitAfter: "def456",
    });
    insertTaskCache(db, "run-1", [
      {
        taskId: "T3",
        title: "Build feature X",
        files: "src/feature.ts, src/feature.test.ts",
        verify: "pnpm test",
        critic: "strict",
        push: "manual",
        spec: "Implement feature X with full test coverage",
        statusBefore: "pending",
      },
    ]);
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T3",
      title: "Build feature X",
      status: "completed",
      commitSha: "abc111",
      startedAt: "2026-03-23T10:01:00",
      finishedAt: "2026-03-23T10:05:00",
      durationSeconds: 240,
      devLogFile: "/tmp/logs/run-1/T3/attempt-1.log",
      criticLogFile: "/tmp/logs/run-1/T3/critic-attempt-1.log",
      diffFile: "/tmp/logs/run-1/T3/diff-attempt-1.patch",
    });

    showTaskLog(db, "T3");

    const output = logs.join("\n");
    expect(output).toContain("noxdev log:");
    expect(output).toContain("T3");
    expect(output).toContain("Build feature X");
    expect(output).toContain("run-1");
    expect(output).toContain("COMPLETED");
    expect(output).toContain("attempt 1");
    expect(output).toContain("Implement feature X with full test coverage");
    expect(output).toContain("src/feature.ts, src/feature.test.ts");
    expect(output).toContain("pnpm test");
    expect(output).toContain("strict");
    expect(output).toContain("manual");
    expect(output).toContain("2026-03-23T10:01:00");
    expect(output).toContain("2026-03-23T10:05:00");
    expect(output).toContain("240s");
    expect(output).toContain("Exit code: 0");
    expect(output).toContain("abc111");
    expect(output).toContain("pending");
    expect(output).toContain("/tmp/logs/run-1/T3/attempt-1.log");
    expect(output).toContain("/tmp/logs/run-1/T3/critic-attempt-1.log");
    expect(output).toContain("/tmp/logs/run-1/T3/diff-attempt-1.patch");
    expect(output).toContain("cat /tmp/logs/run-1/T3/attempt-1.log");
    expect(output).not.toContain("History:");
  });

  it("shows history section for multiple executions", () => {
    insertRun(db, {
      id: "run-1",
      projectId: "proj-1",
      startedAt: "2026-03-23T08:00:00",
      authMode: "max",
      totalTasks: 1,
      commitBefore: "abc123",
      logFile: "/tmp/run.log",
    });
    insertRun(db, {
      id: "run-2",
      projectId: "proj-1",
      startedAt: "2026-03-23T10:00:00",
      authMode: "max",
      totalTasks: 1,
      commitBefore: "def456",
      logFile: "/tmp/run2.log",
    });
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T5",
      title: "Fix bug Y",
      status: "failed",
      exitCode: 1,
      commitSha: null,
      startedAt: "2026-03-23T08:01:00",
      finishedAt: "2026-03-23T08:10:00",
      durationSeconds: 540,
    });
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-2",
      taskId: "T5",
      title: "Fix bug Y",
      status: "completed",
      commitSha: "xyz999",
      startedAt: "2026-03-23T10:01:00",
      finishedAt: "2026-03-23T10:05:00",
      durationSeconds: 240,
    });

    showTaskLog(db, "T5");

    const output = logs.join("\n");
    expect(output).toContain("Latest run: run-2");
    expect(output).toContain("COMPLETED");
    expect(output).toContain("History:");
    expect(output).toContain("Run run-2:");
    expect(output).toContain("Run run-1:");
    expect(output).toContain("540s");
    expect(output).toContain("240s");
  });

  it("shows 'not found' for unknown task-id", () => {
    showTaskLog(db, "T99");

    const output = logs.join("\n");
    expect(output).toContain("No results found for task: T99");
  });

  it("shows spec from tasks cache", () => {
    insertRun(db, {
      id: "run-1",
      projectId: "proj-1",
      startedAt: "2026-03-23T10:00:00",
      authMode: "max",
      totalTasks: 1,
      commitBefore: "abc123",
      logFile: "/tmp/run.log",
    });
    insertTaskCache(db, "run-1", [
      {
        taskId: "T7",
        title: "Add logging",
        files: "src/logger.ts",
        verify: "pnpm build",
        critic: "review",
        push: "auto",
        spec: "Add structured logging\nwith JSON format\nand log levels",
        statusBefore: "pending",
      },
    ]);
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T7",
      title: "Add logging",
      status: "completed",
      commitSha: "log111",
      startedAt: "2026-03-23T10:01:00",
      finishedAt: "2026-03-23T10:05:00",
      durationSeconds: 240,
    });

    showTaskLog(db, "T7");

    const output = logs.join("\n");
    expect(output).toContain("Spec:");
    expect(output).toContain("Add structured logging");
    expect(output).toContain("with JSON format");
    expect(output).toContain("and log levels");
    expect(output).toContain("src/logger.ts");
    expect(output).toContain("pnpm build");
  });
});
