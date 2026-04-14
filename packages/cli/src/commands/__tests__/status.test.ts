import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../../db/migrate.js";
import {
  insertRun,
  updateRunFinished,
  insertTaskResult,
} from "../../db/queries.js";
import { showProjectStatus } from "../status.js";

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

describe("status command", () => {
  let db: InstanceType<typeof Database>;
  let logs: string[];

  beforeEach(() => {
    db = createDb();
    seedProject(db);
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T12:00:00Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows completed run with task count and commit SHAs", () => {
    insertRun(db, {
      id: "run-1",
      projectId: "proj-1",
      startedAt: "2026-03-23T10:00:00",
      authMode: "max",
      totalTasks: 3,
      commitBefore: "abc123",
      logFile: "/tmp/run.log",
    });
    updateRunFinished(db, "run-1", {
      finishedAt: "2026-03-23T11:00:00",
      completed: 2,
      failed: 1,
      skipped: 0,
      status: "finished",
      commitAfter: "def456",
    });
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T1",
      title: "Implement parser",
      status: "completed",
      commitSha: "aaa111",
      startedAt: "2026-03-23T10:01:00",
      finishedAt: "2026-03-23T10:05:00",
      durationSeconds: 240,
    });
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T2",
      title: "Add tests",
      status: "failed",
      exitCode: 1,
      commitSha: null,
      startedAt: "2026-03-23T10:05:00",
      finishedAt: "2026-03-23T10:10:00",
      durationSeconds: 300,
    });
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T3",
      title: "Third task",
      status: "completed",
      commitSha: "bbb222",
      startedAt: "2026-03-23T10:10:00",
      finishedAt: "2026-03-23T10:15:00",
      durationSeconds: 180,
    });

    showProjectStatus(db, "proj-1");

    const output = logs.join("\n");
    expect(output).toContain("noxdev status:");
    expect(output).toContain("Test Project");
    expect(output).toContain("run-1");
    expect(output).toContain("2h ago");
    expect(output).toContain("2 completed");
    expect(output).toContain("1 failed");
    expect(output).toContain("of 3");
    expect(output).toContain("T1:");
    expect(output).toContain("aaa111");
    expect(output).toContain("240s");
    expect(output).toContain("T2:");
    expect(output).toContain("no commit");
    expect(output).toContain("300s");
  });

  it("shows 'No runs yet' when no runs exist", () => {
    showProjectStatus(db, "proj-1");

    const output = logs.join("\n");
    expect(output).toContain("No runs yet");
    expect(output).toContain("noxdev run proj-1");
  });

  it("shows 'in progress' for running run", () => {
    insertRun(db, {
      id: "run-1",
      projectId: "proj-1",
      startedAt: "2026-03-23T11:30:00",
      authMode: "max",
      totalTasks: 5,
      commitBefore: "abc123",
      logFile: "/tmp/run.log",
    });

    showProjectStatus(db, "proj-1");

    const output = logs.join("\n");
    expect(output).toContain("in progress");
    expect(output).toContain("30m ago");
  });
});
