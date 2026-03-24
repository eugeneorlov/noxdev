import type { Command } from "commander";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import chalk from "chalk";
import type Database from "better-sqlite3";
import { getDb } from "../db/index.js";
import { getAllProjects, getProject } from "../db/queries.js";
import { loadProjectConfig } from "../config/index.js";
import { loadGlobalConfig } from "../config/index.js";
import { resolveAuth } from "../auth/index.js";
import { executeRun } from "../engine/orchestrator.js";
import { parseTasksFromFile } from "../parser/tasks.js";
import type { RunContext } from "../engine/types.js";

function generateRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function generateRunIdForProject(projectId: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    "_",
    projectId,
  ].join("");
}

interface ProjectRow {
  id: string;
  display_name: string;
  repo_path: string;
  worktree_path: string;
  branch: string;
}

async function runProject(project: ProjectRow): Promise<void> {
  const db = getDb();
  const globalConfig = loadGlobalConfig();
  const projectConfig = loadProjectConfig(project.repo_path);

  // Resolve auth
  const auth = resolveAuth({
    max: { preferred: globalConfig.accounts.max.preferred },
    api: {
      fallback: globalConfig.accounts.api.fallback,
      dailyCapUsd: globalConfig.accounts.api.daily_cap_usd,
      model: globalConfig.accounts.api.model,
    },
    secrets: {
      provider: globalConfig.secrets.provider,
      globalSecretsFile: globalConfig.secrets.global,
      ageKeyFile: globalConfig.secrets.age_key,
    },
  });

  const runId = generateRunId();
  const gitDir = join(project.repo_path, ".git");

  // Sync worktree with base branch before running tasks
  try {
    const baseBranch = execSync('git symbolic-ref --short HEAD', {
      cwd: project.repo_path,
      encoding: 'utf-8'
    }).trim();
    execSync(`git merge ${baseBranch} --no-edit`, {
      cwd: project.worktree_path,
      stdio: 'pipe'
    });
    console.log(chalk.gray(`  ✓ Worktree synced with ${baseBranch}`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('CONFLICT')) {
      console.error(chalk.red('✖ Merge conflict syncing worktree with base branch.'));
      console.error(chalk.gray('  Resolve manually: cd ' + project.worktree_path));
      console.error(chalk.gray('  Then re-run: noxdev run ' + project.id));
      process.exit(1);
    }
    // If merge fails for other reasons (already up to date, etc), continue
    console.log(chalk.gray('  ✓ Worktree up to date'));
  }

  const ctx: RunContext = {
    projectId: project.id,
    projectConfig,
    worktreeDir: project.worktree_path,
    projectGitDir: gitDir,
    gitTargetPath: gitDir,
    runId,
    db,
    auth,
  };

  await executeRun(ctx);

  // Auto-commit TASKS.md status updates
  try {
    const worktreePath = project.worktree_path;
    execSync('git add TASKS.md', { cwd: worktreePath, stdio: 'pipe' });
    execSync('git commit -m "noxdev: update task statuses"', { cwd: worktreePath, stdio: 'pipe' });
    console.log(chalk.gray('  ✓ TASKS.md status updates committed'));
  } catch {
    // Silently ignore — TASKS.md might not exist or have no changes
  }
}

export async function runAllProjects(
  db: Database.Database,
): Promise<void> {
  const projects = getAllProjects(db) as ProjectRow[];
  if (projects.length === 0) {
    console.log("No registered projects. Run `noxdev init` first.");
    return;
  }

  console.log(
    chalk.bold(
      `noxdev run --all: ${projects.length} registered projects`,
    ),
  );

  // Resolve auth once before the loop
  const globalConfig = loadGlobalConfig();
  const auth = resolveAuth({
    max: { preferred: globalConfig.accounts.max.preferred },
    api: {
      fallback: globalConfig.accounts.api.fallback,
      dailyCapUsd: globalConfig.accounts.api.daily_cap_usd,
      model: globalConfig.accounts.api.model,
    },
    secrets: {
      provider: globalConfig.secrets.provider,
      globalSecretsFile: globalConfig.secrets.global,
      ageKeyFile: globalConfig.secrets.age_key,
    },
  });

  const results: Array<{
    displayName: string;
    completed: number;
    total: number;
  }> = [];

  for (let i = 0; i < projects.length; i++) {
    const proj = projects[i];
    const projectConfig = loadProjectConfig(proj.repo_path);

    // Count pending tasks
    const tasksFile = join(proj.worktree_path, projectConfig.tasks_file);
    let pendingCount = 0;
    try {
      const pending = parseTasksFromFile(tasksFile);
      pendingCount = pending.length;
    } catch {
      pendingCount = 0;
    }

    const time = new Date().toLocaleTimeString();
    console.log(
      `[${time}] Project ${i + 1}/${projects.length}: ${proj.display_name} (${pendingCount} pending tasks)`,
    );

    const runId = generateRunIdForProject(proj.id);
    const gitDir = join(proj.repo_path, ".git");

    const ctx: RunContext = {
      projectId: proj.id,
      projectConfig,
      worktreeDir: proj.worktree_path,
      projectGitDir: gitDir,
      gitTargetPath: gitDir,
      runId,
      db,
      auth,
    };

    let completed = 0;
    let total = pendingCount;

    try {
      await executeRun(ctx);

      // Query run results from DB
      const run = db
        .prepare("SELECT * FROM runs WHERE id = ?")
        .get(runId) as
        | { completed: number; total_tasks: number; failed: number }
        | undefined;
      if (run) {
        completed = run.completed ?? 0;
        total = run.total_tasks;

        // Check circuit-break (all tasks failed)
        if (run.failed === run.total_tasks && run.total_tasks > 0) {
          console.log(
            chalk.yellow(
              `⚠ Project ${proj.display_name}: all tasks failed (circuit-break), continuing to next project`,
            ),
          );
        }
      }
    } catch (err) {
      console.log(
        chalk.yellow(
          `⚠ Project ${proj.display_name} failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    // Auto-commit TASKS.md status updates
    try {
      const worktreePath = proj.worktree_path;
      execSync('git add TASKS.md', { cwd: worktreePath, stdio: 'pipe' });
      execSync('git commit -m "noxdev: update task statuses"', { cwd: worktreePath, stdio: 'pipe' });
      console.log(chalk.gray('  ✓ TASKS.md status updates committed'));
    } catch {
      // Silently ignore — TASKS.md might not exist or have no changes
    }

    results.push({
      displayName: proj.display_name,
      completed,
      total,
    });
  }

  // Print multi-project summary
  console.log("\n---");
  console.log("MULTI-PROJECT RUN COMPLETE");
  for (const r of results) {
    console.log(`  ${r.displayName}: ${r.completed}/${r.total} completed`);
  }
  console.log("---");
}

function whichCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function startOvernightRun(
  project: string | undefined,
  all?: boolean,
): Promise<void> {
  // Build the args for the child process (same command minus --overnight)
  const childArgs = ["run"];
  if (project) childArgs.push(project);
  if (all) childArgs.push("--all");

  // Resolve the entry point — dist/index.js relative to this file's package
  const entryPoint = join(import.meta.dirname, "..", "index.js");

  // Determine sleep inhibitor
  let spawnCmd: string;
  let spawnArgs: string[];

  if (whichCommand("systemd-inhibit")) {
    spawnCmd = "systemd-inhibit";
    spawnArgs = [
      "--what=sleep",
      "--who=noxdev",
      '--why=Overnight coding run',
      "node",
      entryPoint,
      ...childArgs,
    ];
  } else if (whichCommand("caffeinate")) {
    spawnCmd = "caffeinate";
    spawnArgs = ["-s", "node", entryPoint, ...childArgs];
  } else {
    console.log(
      chalk.yellow(
        "Could not inhibit sleep. Machine may sleep during overnight run.",
      ),
    );
    spawnCmd = "node";
    spawnArgs = [entryPoint, ...childArgs];
  }

  const child = spawn(spawnCmd, spawnArgs, {
    detached: true,
    stdio: "ignore",
  });

  const pid = child.pid;
  if (!pid) {
    console.error(chalk.red("Failed to start overnight process."));
    process.exitCode = 1;
    return;
  }

  child.unref();

  // Write PID file
  const noxdevDir = join(homedir(), ".noxdev");
  mkdirSync(noxdevDir, { recursive: true });
  writeFileSync(join(noxdevDir, "noxdev.pid"), String(pid), "utf-8");

  console.log(
    `noxdev overnight run started (PID: ${pid}). Check status with: noxdev status`,
  );
}

export function registerRun(program: Command): void {
  program
    .command("run")
    .description("Run coding tasks")
    .argument("[project]", "project name")
    .option("--overnight", "run in overnight mode")
    .option("--all", "run for all projects")
    .action(
      async (
        project: string | undefined,
        opts: { overnight?: boolean; all?: boolean },
      ) => {
        try {
          if (opts.overnight) {
            await startOvernightRun(project, opts.all);
            return;
          }

          const db = getDb();

          if (opts.all) {
            await runAllProjects(db);
            return;
          }

          // Single project mode
          let projectRow: ProjectRow | null;

          if (project) {
            projectRow = getProject(db, project) as ProjectRow | null;
            if (!projectRow) {
              console.error(
                chalk.red(
                  `Project "${project}" not found. Run \`noxdev init ${project}\` first.`,
                ),
              );
              process.exitCode = 1;
              return;
            }
          } else {
            // No project specified — use the only one, or error if multiple
            const projects = getAllProjects(db) as ProjectRow[];
            if (projects.length === 0) {
              console.error(
                chalk.red(
                  "No projects registered. Run `noxdev init` first.",
                ),
              );
              process.exitCode = 1;
              return;
            }
            if (projects.length > 1) {
              console.error(
                chalk.red(
                  `Multiple projects registered. Specify one: ${projects.map((p) => p.id).join(", ")}`,
                ),
              );
              process.exitCode = 1;
              return;
            }
            projectRow = projects[0];
          }

          await runProject(projectRow);
        } catch (err: unknown) {
          console.error(
            chalk.red(
              `Error: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
          process.exitCode = 1;
        }
      },
    );
}
