import type { Command } from "commander";
import { execSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import ora from "ora";
import { getDb } from "../db/index.js";
import type { ProjectConfig } from "../config/types.js";

interface DetectedCommands {
  test_command: string;
  build_command: string;
  lint_command: string;
}

function detectCommands(repoPath: string): DetectedCommands {
  const defaults: DetectedCommands = {
    test_command: "pnpm test",
    build_command: "pnpm build",
    lint_command: "pnpm lint",
  };

  const pkgPath = join(repoPath, "package.json");
  if (!existsSync(pkgPath)) return defaults;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};

    return {
      test_command: scripts.test ? `pnpm test` : defaults.test_command,
      build_command: scripts.build ? `pnpm build` : defaults.build_command,
      lint_command: scripts.lint ? `pnpm lint` : defaults.lint_command,
    };
  } catch {
    return defaults;
  }
}

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Initialize a new project")
    .argument("<project>", "project name")
    .requiredOption("--repo <path>", "path to git repository")
    .action(async (project: string, opts: { repo: string }) => {
      try {
        await runInit(project, opts.repo);
      } catch (err: unknown) {
        console.error(
          chalk.red(
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        process.exitCode = 1;
      }
    });
}

async function runInit(project: string, repoPath: string): Promise<void> {
  const resolvedRepo = resolve(repoPath);
  const branch = `noxdev/${project}`;
  const worktreePath = join(homedir(), "worktrees", project);

  // 1. Validate repo path
  if (!existsSync(resolvedRepo)) {
    throw new Error(`Repository path does not exist: ${resolvedRepo}`);
  }
  const gitDir = join(resolvedRepo, ".git");
  if (!existsSync(gitDir)) {
    throw new Error(
      `Not a git repository (missing .git): ${resolvedRepo}`,
    );
  }
  console.log(chalk.green("✓") + " Repository validated: " + resolvedRepo);

  // 2. Create git worktree
  const spinnerWt = ora("Creating git worktree…").start();
  try {
    // Check if branch already exists
    let branchExists = false;
    try {
      const result = execSync(`git branch --list ${branch}`, {
        cwd: resolvedRepo,
        encoding: "utf-8",
      }).trim();
      branchExists = result.length > 0;
    } catch {
      // ignore
    }

    let worktreeExisted = false;
    if (branchExists) {
      // Branch exists — add worktree without -b
      try {
        execSync(`git worktree add ${worktreePath} ${branch}`, {
          cwd: resolvedRepo,
          stdio: "pipe",
        });
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists")) {
          worktreeExisted = true;
        } else {
          throw err;
        }
      }
    } else {
      // Create new branch + worktree
      try {
        execSync(
          `git worktree add -b ${branch} ${worktreePath} main`,
          { cwd: resolvedRepo, stdio: "pipe" },
        );
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists")) {
          worktreeExisted = true;
        } else {
          throw err;
        }
      }
    }

    if (worktreeExisted) {
      spinnerWt.warn(`Worktree already exists at ${worktreePath}`);
    } else {
      spinnerWt.succeed(
        `Worktree created at ${chalk.cyan(worktreePath)}`,
      );
    }
  } catch (err: unknown) {
    spinnerWt.fail("Failed to create worktree");
    throw err;
  }

  // 3. Create .noxdev/config.json with auto-detected commands
  const detected = detectCommands(resolvedRepo);
  const configDir = join(resolvedRepo, ".noxdev");
  const configPath = join(configDir, "config.json");

  const projectConfig: ProjectConfig = {
    project,
    display_name: project,
    test_command: detected.test_command,
    build_command: detected.build_command,
    lint_command: detected.lint_command,
    docker: {
      memory: "4g",
      cpus: 2,
      timeout_minutes: 30,
    },
    secrets: "",
    tasks_file: "TASKS.md",
    critic_default: "strict",
    push_default: "never",
  };

  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(projectConfig, null, 2) + "\n");
  console.log(chalk.green("✓") + " Config written: " + configPath);

  // 4. Register project in SQLite
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM projects WHERE id = ?")
    .get(project) as { id: string } | undefined;

  if (existing) {
    console.log(
      chalk.yellow("⚠") +
        ` Project "${project}" already registered — updating`,
    );
    db.prepare(
      `UPDATE projects
       SET repo_path = ?, worktree_path = ?, branch = ?,
           test_command = ?, build_command = ?, lint_command = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      resolvedRepo,
      worktreePath,
      branch,
      detected.test_command,
      detected.build_command,
      detected.lint_command,
      project,
    );
  } else {
    db.prepare(
      `INSERT INTO projects (id, display_name, repo_path, worktree_path, branch,
                             test_command, build_command, lint_command)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      project,
      project,
      resolvedRepo,
      worktreePath,
      branch,
      detected.test_command,
      detected.build_command,
      detected.lint_command,
    );
  }
  console.log(chalk.green("✓") + ` Project "${project}" registered in database`);

  // 5. Check Docker image
  let dockerOk = false;
  try {
    const result = execSync("docker images -q noxdev-runner:latest", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    dockerOk = result.length > 0;
  } catch {
    // docker not available or errored
  }

  if (!dockerOk) {
    console.log(
      chalk.yellow("⚠") +
        " Docker image noxdev-runner:latest not found. Build it before running tasks.",
    );
  } else {
    console.log(chalk.green("✓") + " Docker image noxdev-runner:latest found");
  }

  // 6. Print summary
  console.log("");
  console.log(chalk.bold("Project initialized:"));
  console.log(`  Worktree:  ${chalk.cyan(worktreePath)}`);
  console.log(`  Branch:    ${chalk.cyan(branch)}`);
  console.log(`  Test:      ${detected.test_command}`);
  console.log(`  Build:     ${detected.build_command}`);
  console.log(`  Lint:      ${detected.lint_command}`);
  console.log(`  Config:    ${configPath}`);

  // 7. Print next step
  console.log("");
  console.log(
    chalk.blue("→") +
      ` Write tasks in ${worktreePath}/TASKS.md then run: ${chalk.bold(`noxdev run ${project}`)}`,
  );
}
