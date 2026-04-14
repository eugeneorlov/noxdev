import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDb, type Database } from "../../db/connection.js";
import { migrate } from "../../db/migrate.js";

vi.mock("../../engine/orchestrator.js", () => ({
  executeRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../db/queries.js", () => ({
  getAllProjects: vi.fn().mockReturnValue([]),
  getProject: vi.fn(),
}));

vi.mock("../../config/index.js", () => ({
  loadProjectConfig: vi.fn().mockReturnValue({
    project: "",
    display_name: "",
    test_command: "pnpm test",
    build_command: "pnpm build",
    lint_command: "pnpm lint",
    docker: { memory: "4g", cpus: 2, timeout_minutes: 30 },
    secrets: "",
    tasks_file: "TASKS.md",
    critic_default: "strict",
    push_default: "never",
  }),
  loadGlobalConfig: vi.fn().mockReturnValue({
    accounts: {
      max: { preferred: true, rate_limit_ceiling: 80 },
      api: { fallback: true, daily_cap_usd: 5, model: "claude-sonnet-4-6" },
    },
    safety: {
      auto_push: false,
      max_retries_per_task: 3,
      circuit_breaker_threshold: 5,
    },
    secrets: { provider: "age", global: "", age_key: "" },
  }),
}));

vi.mock("../../auth/index.js", () => ({
  resolveAuth: vi.fn().mockReturnValue({
    mode: "max",
    model: "claude-sonnet-4-20250514",
  }),
  isMaxAvailable: vi.fn(),
  getMaxCredentialPath: vi.fn(),
}));

vi.mock("../../parser/tasks.js", () => ({
  parseTasksFromFile: vi.fn().mockReturnValue([]),
  parseTasks: vi.fn().mockReturnValue([]),
}));

import { runAllProjects } from "../run.js";
import { executeRun } from "../../engine/orchestrator.js";
import { getAllProjects } from "../../db/queries.js";

function createDb(): Database {
  const db = openDb(":memory:", { runMigrations: false });
  migrate(db);
  return db;
}

describe("run --all multi-project", () => {
  let db: Database;
  let logs: string[];
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    db = createDb();
    logs = [];
    consoleSpy = vi
      .spyOn(console, "log")
      .mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      });
    vi.mocked(executeRun).mockClear().mockResolvedValue(undefined);
    vi.mocked(getAllProjects).mockClear();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("prints no-projects message when 0 projects registered", async () => {
    vi.mocked(getAllProjects).mockReturnValue([]);

    await runAllProjects(db);

    const output = logs.join("\n");
    expect(output).toContain("No registered projects");
    expect(executeRun).not.toHaveBeenCalled();
  });

  it("calls executeRun once per project with --all", async () => {
    vi.mocked(getAllProjects).mockReturnValue([
      {
        id: "proj-a",
        display_name: "Project A",
        repo_path: "/tmp/a",
        worktree_path: "/tmp/wt-a",
        branch: "main",
      },
      {
        id: "proj-b",
        display_name: "Project B",
        repo_path: "/tmp/b",
        worktree_path: "/tmp/wt-b",
        branch: "main",
      },
    ]);

    await runAllProjects(db);

    expect(executeRun).toHaveBeenCalledTimes(2);

    const firstCall = vi.mocked(executeRun).mock.calls[0][0];
    const secondCall = vi.mocked(executeRun).mock.calls[1][0];
    expect(firstCall.projectId).toBe("proj-a");
    expect(secondCall.projectId).toBe("proj-b");
  });

  it("generates unique runId per project containing projectId", async () => {
    vi.mocked(getAllProjects).mockReturnValue([
      {
        id: "proj-a",
        display_name: "Project A",
        repo_path: "/tmp/a",
        worktree_path: "/tmp/wt-a",
        branch: "main",
      },
      {
        id: "proj-b",
        display_name: "Project B",
        repo_path: "/tmp/b",
        worktree_path: "/tmp/wt-b",
        branch: "main",
      },
    ]);

    await runAllProjects(db);

    const firstCall = vi.mocked(executeRun).mock.calls[0][0];
    const secondCall = vi.mocked(executeRun).mock.calls[1][0];
    expect(firstCall.runId).toContain("proj-a");
    expect(secondCall.runId).toContain("proj-b");
    expect(firstCall.runId).not.toBe(secondCall.runId);
  });
});
