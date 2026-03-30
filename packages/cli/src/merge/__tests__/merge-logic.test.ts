import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../../db/migrate.js";
import { insertRun, insertTaskResult } from "../../db/queries.js";
import {
  getMergeCandidates,
  getDiffStats,
  getFullDiff,
  applyMergeDecisions,
  type MergeDecision,
} from "../interactive.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";

const mockExecSync = vi.mocked(execSync);

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
  ).run(id, "Test Project", "/tmp/repo", "/tmp/wt", "noxdev/proj-1");
}

const RUN = {
  id: "run-1",
  projectId: "proj-1",
  startedAt: "2026-03-23T10:00:00Z",
  authMode: "max",
  totalTasks: 3,
  commitBefore: "abc123",
  logFile: "/tmp/run.log",
};

const TASK_DEFAULTS = {
  exitCode: 0,
  authMode: "max",
  criticMode: "review",
  pushMode: "auto",
  attempt: 1,
  startedAt: "2026-03-23T10:01:00Z",
  finishedAt: "2026-03-23T10:05:00Z",
  durationSeconds: 240,
  devLogFile: null,
  criticLogFile: null,
  diffFile: null,
};

describe("getMergeCandidates", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = createDb();
    seedProject(db);
    insertRun(db, RUN);
  });

  it("returns only COMPLETED tasks with pending merge and commit_sha", () => {
    // completed with commit — should be returned
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T1",
      title: "Task One",
      status: "completed",
      commitSha: "aaa111",
    });

    // completed_retry with commit — should be returned
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T2",
      title: "Task Two",
      status: "completed_retry",
      commitSha: "bbb222",
    });

    // failed — should NOT be returned
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T3",
      title: "Task Three",
      status: "failed",
      commitSha: "ccc333",
    });

    // completed but no commit sha — should NOT be returned
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T4",
      title: "Task Four",
      status: "completed",
      commitSha: null,
    });

    const candidates = getMergeCandidates(db, "proj-1");
    expect(candidates).toHaveLength(2);
    expect(candidates[0].taskId).toBe("T1");
    expect(candidates[0].commitSha).toBe("aaa111");
    expect(candidates[0].status).toBe("completed");
    expect(candidates[1].taskId).toBe("T2");
    expect(candidates[1].commitSha).toBe("bbb222");
    expect(candidates[1].status).toBe("completed_retry");
  });

  it("returns empty array when no pending tasks", () => {
    // Insert a task that's already approved
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T1",
      title: "Task One",
      status: "completed",
      commitSha: "aaa111",
    });

    // Mark as approved
    db.prepare(`UPDATE task_results SET merge_decision = LOWER('approved') WHERE task_id = 'T1'`).run();

    const candidates = getMergeCandidates(db, "proj-1");
    expect(candidates).toHaveLength(0);
  });

  it("returns empty array when no runs exist", () => {
    const db2 = createDb();
    seedProject(db2, "proj-2");
    const candidates = getMergeCandidates(db2, "proj-2");
    expect(candidates).toHaveLength(0);
  });
});

describe("getDiffStats", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it("calls git show --stat and returns trimmed output", () => {
    mockExecSync.mockReturnValue(
      " src/components/CoffeeRoulette.tsx | 16 ++++++++------\n 1 file changed, 10 insertions(+), 6 deletions(-)\n",
    );

    const result = getDiffStats("/tmp/wt", "abc123");

    expect(mockExecSync).toHaveBeenCalledWith(
      'git show --stat --format="" abc123',
      { cwd: "/tmp/wt", encoding: "utf-8" },
    );
    expect(result).toBe(
      "src/components/CoffeeRoulette.tsx | 16 ++++++++------\n 1 file changed, 10 insertions(+), 6 deletions(-)",
    );
  });
});

describe("getFullDiff", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it("calls git show and returns full output", () => {
    const fakeDiff = "commit abc123\nAuthor: dev\n\ndiff --git a/file.ts b/file.ts\n+new line\n";
    mockExecSync.mockReturnValue(fakeDiff);

    const result = getFullDiff("/tmp/wt", "abc123");

    expect(mockExecSync).toHaveBeenCalledWith("git show abc123", {
      cwd: "/tmp/wt",
      encoding: "utf-8",
    });
    expect(result).toBe(fakeDiff);
  });
});

describe("applyMergeDecisions", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = createDb();
    seedProject(db);
    insertRun(db, RUN);
    mockExecSync.mockReset();
    // Default: mock getBranchFromWorktree
    mockExecSync.mockReturnValue("noxdev/proj-1\n");
  });

  it("all approved — updates SQLite and merges", () => {
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T1",
      title: "Task One",
      status: "completed",
      commitSha: "aaa111",
    });
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T2",
      title: "Task Two",
      status: "completed",
      commitSha: "bbb222",
    });

    const rows = db.prepare(`SELECT id, task_id FROM task_results`).all() as Array<{
      id: number;
      task_id: string;
    }>;

    const decisions: MergeDecision[] = rows.map((r) => ({
      taskResultId: r.id,
      taskId: r.task_id,
      decision: "approved" as const,
    }));

    const result = applyMergeDecisions(db, "/tmp/wt", "/tmp/repo", decisions);

    expect(result.merged).toBe(2);
    expect(result.rejected).toBe(0);
    expect(result.skipped).toBe(0);

    // Check SQLite updated
    const updated = db.prepare(`SELECT merge_decision, merged_at FROM task_results`).all() as Array<{
      merge_decision: string;
      merged_at: string | null;
    }>;
    for (const row of updated) {
      expect(row.merge_decision).toBe("approved");
      expect(row.merged_at).not.toBeNull();
    }

    // Check git merge was called
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("git merge noxdev/proj-1"),
      expect.objectContaining({ cwd: "/tmp/repo" }),
    );
  });

  it("mixed decisions — rejected get reverted, approved merged, skipped unchanged", () => {
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T1",
      title: "Task One",
      status: "completed",
      commitSha: "aaa111",
    });
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T2",
      title: "Task Two",
      status: "completed",
      commitSha: "bbb222",
    });
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T3",
      title: "Task Three",
      status: "completed",
      commitSha: "ccc333",
    });

    const rows = db.prepare(`SELECT id, task_id FROM task_results ORDER BY id`).all() as Array<{
      id: number;
      task_id: string;
    }>;

    const decisions: MergeDecision[] = [
      { taskResultId: rows[0].id, taskId: "T1", decision: "approved" },
      { taskResultId: rows[1].id, taskId: "T2", decision: "rejected" },
      { taskResultId: rows[2].id, taskId: "T3", decision: "skipped" },
    ];

    const result = applyMergeDecisions(db, "/tmp/wt", "/tmp/repo", decisions);

    expect(result.merged).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.skipped).toBe(1);

    // Check SQLite state
    const updated = db
      .prepare(`SELECT task_id, merge_decision, merged_at FROM task_results ORDER BY id`)
      .all() as Array<{
      task_id: string;
      merge_decision: string;
      merged_at: string | null;
    }>;

    // T1 approved
    expect(updated[0].merge_decision).toBe("approved");
    expect(updated[0].merged_at).not.toBeNull();

    // T2 rejected
    expect(updated[1].merge_decision).toBe("rejected");
    expect(updated[1].merged_at).not.toBeNull();

    // T3 skipped — still pending
    expect(updated[2].merge_decision).toBe("pending");
    expect(updated[2].merged_at).toBeNull();

    // Check git revert was called for T2
    expect(mockExecSync).toHaveBeenCalledWith(
      "git revert --no-commit bbb222",
      expect.objectContaining({ cwd: "/tmp/wt" }),
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      'git commit -m "noxdev: revert T2 (rejected in merge review)"',
      expect.objectContaining({ cwd: "/tmp/wt" }),
    );

    // Check git merge was called (because T1 was approved)
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("git merge"),
      expect.objectContaining({ cwd: "/tmp/repo" }),
    );
  });

  it("all skipped — no SQLite updates, no git merge", () => {
    insertTaskResult(db, {
      ...TASK_DEFAULTS,
      runId: "run-1",
      taskId: "T1",
      title: "Task One",
      status: "completed",
      commitSha: "aaa111",
    });

    const rows = db.prepare(`SELECT id, task_id FROM task_results`).all() as Array<{
      id: number;
      task_id: string;
    }>;

    const decisions: MergeDecision[] = [
      { taskResultId: rows[0].id, taskId: "T1", decision: "skipped" },
    ];

    const result = applyMergeDecisions(db, "/tmp/wt", "/tmp/repo", decisions);

    expect(result.merged).toBe(0);
    expect(result.rejected).toBe(0);
    expect(result.skipped).toBe(1);

    // SQLite still pending
    const updated = db.prepare(`SELECT merge_decision, merged_at FROM task_results`).all() as Array<{
      merge_decision: string;
      merged_at: string | null;
    }>;
    expect(updated[0].merge_decision).toBe("pending");
    expect(updated[0].merged_at).toBeNull();

    // No git merge called (only the branch name lookup may be called)
    const mergeCalls = mockExecSync.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("git merge"),
    );
    expect(mergeCalls).toHaveLength(0);
  });
});
