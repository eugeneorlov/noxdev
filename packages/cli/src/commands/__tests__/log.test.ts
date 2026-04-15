import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDb, type Database } from "../../db/connection.js";
import { migrate } from "../../db/migrate.js";
import {
  insertRun,
  updateRunFinished,
  insertTaskResult,
  insertTaskCache,
} from "../../db/queries.js";

// Mock the db module before importing logCommand
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

import { logCommand } from "../log.js";
import { getDb } from "../../db/index.js";

function createDb(): Database {
  const db = openDb(":memory:", { runMigrations: false });
  migrate(db);
  return db;
}

function seedProject(
  db: Database,
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
  attempt: 1,
  devLogFile: null,
  criticLogFile: null,
  diffFile: null,
};

describe("log command", () => {
  let db: Database;
  let logs: string[];
  let errorLogs: string[];

  beforeEach(() => {
    db = createDb();
    seedProject(db);
    logs = [];
    errorLogs = [];

    // Mock console.log and console.error
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errorLogs.push(args.map(String).join(" "));
    });

    // Mock process.exit to prevent tests from actually exiting
    vi.spyOn(process, "exit").mockImplementation((code?: string | number | null | undefined) => {
      throw new Error(`process.exit(${code})`);
    });

    // Mock getDb to return our test database
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows task detail when called with project and taskId", async () => {
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

    await logCommand("proj-1", "T3");

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
    expect(output).toContain("2026-03-23T10:01:00");
    expect(output).toContain("2026-03-23T10:05:00");
    expect(output).toContain("240s");
    expect(output).toContain("Exit code: 0");
    expect(output).toContain("abc111");
    expect(output).toContain("/tmp/logs/run-1/T3/attempt-1.log");
    expect(output).toContain("/tmp/logs/run-1/T3/critic-attempt-1.log");
    expect(output).toContain("/tmp/logs/run-1/T3/diff-attempt-1.patch");
    expect(output).toContain("cat /tmp/logs/run-1/T3/attempt-1.log");
    expect(output).not.toContain("History:");
  });

  it("lists tasks when called with project only", async () => {
    insertRun(db, {
      id: "run-1",
      projectId: "proj-1",
      startedAt: "2026-03-23T10:00:00",
      authMode: "max",
      totalTasks: 2,
      commitBefore: "abc123",
      logFile: "/tmp/run.log",
    });
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T1",
      title: "Fix bug Y",
      status: "completed",
      commitSha: "xyz999",
      startedAt: "2026-03-23T10:01:00",
      finishedAt: "2026-03-23T10:05:00",
      durationSeconds: 240,
    });
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T2",
      title: "Add feature Z",
      status: "failed",
      exitCode: 1,
      commitSha: null,
      startedAt: "2026-03-23T10:06:00",
      finishedAt: "2026-03-23T10:10:00",
      durationSeconds: 180,
    });

    await logCommand("proj-1");

    const output = logs.join("\n");
    expect(output).toContain("noxdev log: Test Project");
    expect(output).toContain("run run-1");
    expect(output).toContain("1/2 tasks completed, 1 failed");
    expect(output).toContain("T1  COMPLETED");
    expect(output).toContain("T2  FAILED");
    expect(output).toContain("Fix bug Y");
    expect(output).toContain("Add feature Z");
    expect(output).toContain("240s");
    expect(output).toContain("180s");
    expect(output).toContain("xyz999".slice(0, 7));
    expect(output).toContain("For detail: noxdev log proj-1");
  });

  it("shows usage help when no project provided and not in worktree", async () => {
    // Mock process.cwd to return a directory without .noxdev config
    const originalCwd = process.cwd;
    vi.spyOn(process, "cwd").mockReturnValue("/tmp/no-noxdev-here");

    await logCommand();

    const output = logs.join("\n");
    expect(output).toContain("Usage: noxdev log <project> [task-id]");
    expect(output).toContain("noxdev log mit-nexus");
    expect(output).toContain("Run from inside a project worktree to infer");

    // Restore original cwd
    process.cwd = originalCwd;
  });

  it("exits with error for unknown project", async () => {
    await expect(async () => {
      await logCommand("unknown-project");
    }).rejects.toThrow("process.exit(1)");

    const errorOutput = errorLogs.join("\n");
    expect(errorOutput).toContain("✖ No such project: \"unknown-project\"");
    expect(errorOutput).toContain("Registered projects:");
    expect(errorOutput).toContain("proj-1  (Test Project)");
  });

  it("shows no runs message for project with no runs", async () => {
    seedProject(db, "proj-2", "Empty Project");

    await logCommand("proj-2");

    const output = logs.join("\n");
    expect(output).toContain("No runs recorded for proj-2. Run: noxdev run proj-2");
  });

  it("exits with error for unknown task in project", async () => {
    insertRun(db, {
      id: "run-1",
      projectId: "proj-1",
      startedAt: "2026-03-23T10:00:00",
      authMode: "max",
      totalTasks: 1,
      commitBefore: "abc123",
      logFile: "/tmp/run.log",
    });
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T1",
      title: "Fix bug Y",
      status: "completed",
      commitSha: "xyz999",
      startedAt: "2026-03-23T10:01:00",
      finishedAt: "2026-03-23T10:05:00",
      durationSeconds: 240,
    });

    await expect(async () => {
      await logCommand("proj-1", "T99");
    }).rejects.toThrow("process.exit(1)");

    const errorOutput = errorLogs.join("\n");
    expect(errorOutput).toContain("✖ No task T99 in most recent run of proj-1");
    expect(errorOutput).toContain("Last run had: T1");
  });

  it("shows spec from tasks cache in detail mode", async () => {
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

    await logCommand("proj-1", "T7");

    const output = logs.join("\n");
    expect(output).toContain("Spec:");
    expect(output).toContain("Add structured logging");
    expect(output).toContain("with JSON format");
    expect(output).toContain("and log levels");
    expect(output).toContain("src/logger.ts");
    expect(output).toContain("pnpm build");
  });
});
