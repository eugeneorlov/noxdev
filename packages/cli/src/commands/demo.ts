import type { Command } from "commander";
import { execSync, spawn } from "node:child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createInterface } from "node:readline";
import chalk from "chalk";
import ora from "ora";
import { getDb } from "../db/index.js";
import type { ProjectConfig } from "../config/types.js";

export function registerDemo(program: Command): void {
  program
    .command("demo")
    .description("Scaffold a fresh Vite + React + TypeScript project and run noxdev demo tasks")
    .option("--fresh", "Clean up any existing noxdev-demo project first")
    .action(async (opts: { fresh?: boolean }) => {
      try {
        await runDemo(opts);
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

async function runDemo(opts: { fresh?: boolean } = {}): Promise<void> {
  console.log(chalk.bold('\n🎭 noxdev demo\n'));

  const projectName = "noxdev-demo";
  const tempDir = join(tmpdir(), projectName);
  const worktreePath = join(homedir(), "worktrees", projectName);
  const branch = `noxdev/${projectName}`;

  // Clean up existing project if --fresh option is used
  if (opts.fresh) {
    console.log(chalk.yellow('🧹 Cleaning up existing demo project...'));

    // Remove from database
    const db = getDb();
    const existing = db
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(projectName) as { id: string } | undefined;

    if (existing) {
      db.prepare("DELETE FROM projects WHERE id = ?").run(projectName);
      console.log(chalk.gray('  ✓ Removed project from database'));
    }

    // Remove worktree directory
    if (existsSync(worktreePath)) {
      rmSync(worktreePath, { recursive: true, force: true });
      console.log(chalk.gray('  ✓ Removed worktree directory'));
    }

    // Remove temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
      console.log(chalk.gray('  ✓ Removed temporary directory'));
    }

    console.log(chalk.green('✓ Cleanup complete\n'));
  }

  console.log(chalk.cyan('This demo will:'));
  console.log(chalk.gray('  • Scaffold a fresh Vite + React + TypeScript project'));
  console.log(chalk.gray('  • Register it with noxdev'));
  console.log(chalk.gray('  • Copy demo tasks and run them autonomously'));
  console.log(chalk.gray('  • Show you the completed result\n'));

  // Step 1: Check prerequisites
  console.log(chalk.bold('Step 1: Checking prerequisites'));

  // Check if Docker image exists
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
    console.error(chalk.red('✖ Docker image noxdev-runner:latest not found.'));
    console.error(chalk.yellow('  Run `noxdev setup` first to build the Docker image.'));
    process.exit(1);
  }
  console.log(chalk.green('✓ Docker image noxdev-runner:latest found'));

  // Check for existing demo project
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM projects WHERE id = ?")
    .get(projectName) as { id: string } | undefined;

  if (existing) {
    console.log(chalk.yellow(`⚠ Project "${projectName}" already exists.`));
    console.log(chalk.gray('  Use --fresh to clean up and start over.'));
    console.log(chalk.gray(`  Or run: noxdev run ${projectName}`));
    return;
  }

  // Step 2: Scaffold Vite project
  console.log(chalk.bold('\nStep 2: Scaffolding Vite + React + TypeScript project'));

  const spinner = ora('Creating Vite project...').start();
  try {
    // Create project with Vite
    execSync(`npm create vite@latest ${projectName} -- --template react-ts`, {
      cwd: tmpdir(),
      stdio: 'pipe'
    });
    spinner.succeed('Vite project scaffolded');
  } catch (err: unknown) {
    spinner.fail('Failed to scaffold Vite project');
    throw err;
  }

  // Step 3: Initialize git repository
  console.log(chalk.bold('\nStep 3: Initializing git repository'));

  const gitSpinner = ora('Setting up git...').start();
  try {
    // Initialize git repo
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });

    // Set git identity
    execSync('git config user.name "noxdev"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "noxdev@demo"', { cwd: tempDir, stdio: 'pipe' });

    // Add and commit initial files
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "Initial Vite scaffold"', { cwd: tempDir, stdio: 'pipe' });

    gitSpinner.succeed('Git repository initialized');
  } catch (err: unknown) {
    gitSpinner.fail('Failed to initialize git repository');
    throw err;
  }

  // Step 4: Register project with noxdev (using similar logic to init command)
  console.log(chalk.bold('\nStep 4: Registering project with noxdev'));

  const registerSpinner = ora('Creating worktree and registering project...').start();
  try {
    // Create git worktree
    const defaultBranch = execSync('git symbolic-ref --short HEAD', {
      cwd: tempDir,
      encoding: 'utf-8'
    }).trim();

    execSync(`git worktree add -b ${branch} ${worktreePath} ${defaultBranch}`, {
      cwd: tempDir,
      stdio: 'pipe'
    });

    // Create .noxdev/config.json
    const projectConfig: ProjectConfig = {
      project: projectName,
      display_name: projectName,
      test_command: "pnpm test",
      build_command: "pnpm build",
      lint_command: "pnpm lint",
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

    const configDir = join(tempDir, ".noxdev");
    const configPath = join(configDir, "config.json");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(projectConfig, null, 2) + "\n");

    // Register in database
    db.prepare(
      `INSERT INTO projects (id, display_name, repo_path, worktree_path, branch,
                             test_command, build_command, lint_command)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      projectName,
      projectName,
      tempDir,
      worktreePath,
      branch,
      "pnpm test",
      "pnpm build",
      "pnpm lint"
    );

    registerSpinner.succeed('Project registered with noxdev');
  } catch (err: unknown) {
    registerSpinner.fail('Failed to register project');
    throw err;
  }

  // Step 5: Copy demo tasks template
  console.log(chalk.bold('\nStep 5: Setting up demo tasks'));

  const tasksSpinner = ora('Copying demo tasks template...').start();
  try {
    // Find the templates directory (relative to this file)
    const templatesDir = join(import.meta.dirname, "../../../templates");
    const demoTasksPath = join(templatesDir, "demo-tasks.md");
    const targetTasksPath = join(worktreePath, "TASKS.md");

    copyFileSync(demoTasksPath, targetTasksPath);

    tasksSpinner.succeed('Demo tasks copied');
  } catch (err: unknown) {
    tasksSpinner.fail('Failed to copy demo tasks');
    throw err;
  }

  // Step 6: Install dependencies in worktree
  console.log(chalk.bold('\nStep 6: Installing dependencies'));

  const depsSpinner = ora('Installing dependencies with pnpm...').start();
  try {
    execSync('pnpm install', { cwd: worktreePath, stdio: 'pipe' });
    depsSpinner.succeed('Dependencies installed');
  } catch (err: unknown) {
    depsSpinner.fail('Failed to install dependencies');
    throw err;
  }

  // Step 7: Run noxdev on the project
  console.log(chalk.bold('\nStep 7: Running noxdev demo tasks autonomously'));
  console.log(chalk.cyan('🤖 Launching autonomous agent...\n'));

  try {
    // Import and execute the run logic
    const { runAllProjects } = await import("./run.js");

    // Run just this project
    const projectRow = {
      id: projectName,
      display_name: projectName,
      repo_path: tempDir,
      worktree_path: worktreePath,
      branch: branch,
    };

    // Execute a single project run
    await runSingleProject(projectRow);

  } catch (err: unknown) {
    console.error(chalk.red('Failed to run noxdev tasks:'), err instanceof Error ? err.message : String(err));
    throw err;
  }

  // Step 8: Show results
  console.log(chalk.bold('\n🎉 Demo complete!'));
  console.log('');
  console.log(chalk.green('✓ Vite + React + TypeScript project scaffolded'));
  console.log(chalk.green('✓ Git repository initialized'));
  console.log(chalk.green('✓ Project registered with noxdev'));
  console.log(chalk.green('✓ Demo tasks executed autonomously'));
  console.log('');
  console.log(chalk.bold('What happened:'));
  console.log(chalk.gray('  • noxdev read the task specifications in TASKS.md'));
  console.log(chalk.gray('  • Claude Code built the welcome page according to specs'));
  console.log(chalk.gray('  • All changes were committed automatically'));
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log(chalk.gray(`  • View the result: cd ${worktreePath} && pnpm dev`));
  console.log(chalk.gray(`  • See the tasks: cat ${worktreePath}/TASKS.md`));
  console.log(chalk.gray(`  • Run more tasks: noxdev run ${projectName}`));
  console.log(chalk.gray('  • Review changes: noxdev dashboard'));
  console.log('');
  console.log(chalk.cyan('🦉 Welcome to autonomous development with noxdev!'));
}

// Helper function to run a single project (extracted from run.ts logic)
async function runSingleProject(project: {
  id: string;
  display_name: string;
  repo_path: string;
  worktree_path: string;
  branch: string;
}): Promise<void> {
  const { loadGlobalConfig, loadProjectConfig } = await import("../config/index.js");
  const { resolveAuth } = await import("../auth/index.js");
  const { executeRun } = await import("../engine/orchestrator.js");

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

  const ctx = {
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
    execSync('git add TASKS.md', { cwd: project.worktree_path, stdio: 'pipe' });
    execSync('git commit -m "noxdev: update task statuses"', { cwd: project.worktree_path, stdio: 'pipe' });
    console.log(chalk.gray('  ✓ TASKS.md status updates committed'));
  } catch {
    // Silently ignore — TASKS.md might not have changes
  }
}

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