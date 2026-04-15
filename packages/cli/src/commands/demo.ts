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
import { demoTasksPath } from '../lib/paths.js';
import { dumpErr } from '../lib/errors.js';



export function registerDemo(program: Command): void {
  program
    .command("demo")
    .description("Scaffold a fullstack React + FastAPI application and run noxdev demo tasks")
    .action(async () => {
      try {
        await runDemo();
      } catch (err: unknown) {
        console.error(
          chalk.red(
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        dumpErr(err);
        process.exitCode = 1;
      }
    });
}

async function runDemo(): Promise<void> {
  console.log(chalk.bold('\n🦉 noxdev demo\n'));

  const projectName = "noxdev-demo";
  const tempDir = join(tmpdir(), projectName);
  const worktreePath = join(homedir(), "worktrees", projectName);
  const branch = `noxdev/${projectName}`;

  // Always clean up previous demo state
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM projects WHERE id = ?")
    .get(projectName) as { id: string } | undefined;

  if (existing || existsSync(worktreePath) || existsSync(tempDir)) {
    console.log(chalk.yellow('🧹 Cleaning up previous demo...'));
    if (existing) {
      db.prepare("DELETE FROM task_results WHERE run_id IN (SELECT id FROM runs WHERE project_id = ?)").run(projectName);
      db.prepare("DELETE FROM tasks WHERE run_id IN (SELECT id FROM runs WHERE project_id = ?)").run(projectName);
      db.prepare("DELETE FROM runs WHERE project_id = ?").run(projectName);
      db.prepare("DELETE FROM projects WHERE id = ?").run(projectName);
    }
    if (existsSync(worktreePath)) {
      rmSync(worktreePath, { recursive: true, force: true });
    }
    if (existsSync(tempDir)) {
      try {
        execSync(`git -C ${tempDir} branch -D noxdev/${projectName}`, { stdio: ['pipe', 'pipe', 'pipe'] });
      } catch {
        // Branch may not exist — fine, nothing to clean up
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  console.log(chalk.cyan('This demo will:'));
  console.log(chalk.gray('  • Scaffold a fullstack React frontend + FastAPI backend'));
  console.log(chalk.gray('  • Register it with noxdev'));
  console.log(chalk.gray('  • Copy demo tasks and run them autonomously'));
  console.log(chalk.gray('  • Show you the completed fullstack todo app\n'));

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
  } catch (err: unknown) {
    // docker not available or errored
    dumpErr(err);
  }

  if (!dockerOk) {
    console.error(chalk.red('✖ Docker image noxdev-runner:latest not found.'));
    console.error(chalk.yellow('  Run `noxdev setup` first to build the Docker image.'));
    process.exit(1);
  }
  console.log(chalk.green('✓ Docker image noxdev-runner:latest found'));

  // Check if uv is installed
  let uvOk = false;
  try {
    execSync("uv --version", {
      stdio: ["pipe", "pipe", "pipe"],
    });
    uvOk = true;
  } catch (err: unknown) {
    // uv not available or errored
    dumpErr(err);
  }

  if (!uvOk) {
    console.error(chalk.red('✖ uv not found.'));
    console.error(chalk.yellow('  Install uv from: curl -LsSf https://astral.sh/uv/install.sh | sh'));
    console.error(chalk.yellow('  Or visit: https://docs.astral.sh/uv/getting-started/installation/'));
    process.exit(1);
  }
  console.log(chalk.green('✓ uv found'));

  // Check if python3 is installed
  let python3Ok = false;
  try {
    execSync("python3 --version", {
      stdio: ["pipe", "pipe", "pipe"],
    });
    python3Ok = true;
  } catch (err: unknown) {
    // python3 not available or errored
    dumpErr(err);
  }

  if (!python3Ok) {
    console.error(chalk.red('✖ python3 not found.'));
    console.error(chalk.yellow('  Install Python 3.12+ from: https://www.python.org/downloads/'));
    console.error(chalk.yellow('  Or use your system package manager (e.g., apt install python3, brew install python@3.12)'));
    process.exit(1);
  }
  console.log(chalk.green('✓ python3 found'));

  // Step 2: Scaffold fullstack project
  console.log(chalk.bold('\nStep 2: Scaffolding fullstack React + FastAPI project'));

  const spinner = ora('Creating project structure...').start();
  try {
    // Create root project directory
    mkdirSync(tempDir, { recursive: true });

    // Create frontend with Vite React TypeScript template
    const frontendPath = join(tempDir, 'frontend');
    execSync(`pnpm dlx create-vite@latest frontend --template react-ts`, {
      cwd: tempDir,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Create backend directory and basic FastAPI structure
    const backendPath = join(tempDir, 'backend');
    mkdirSync(backendPath, { recursive: true });

    // Create basic FastAPI main.py
    const fastApiContent = `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "FastAPI backend is running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
`;
    writeFileSync(join(backendPath, 'main.py'), fastApiContent);

    // Create pyproject.toml for uv-managed backend
    const pyprojectContent = `[project]
      name = "backend"
      version = "0.1.0"
      requires-python = ">=3.12"
      dependencies = [
          "fastapi>=0.104.0",
          "uvicorn[standard]>=0.24.0",
      ]
      `;
    writeFileSync(join(backendPath, 'pyproject.toml'), pyprojectContent);
    // Create root package.json for workspace
    const rootPackageJson = {
      name: projectName,
      private: true,
      workspaces: ["frontend", "backend"],
      scripts: {
        "dev:frontend": "cd frontend && pnpm dev",
        "dev:backend": "cd backend && uv run uvicorn main:app --reload --port 8000",
        "build:frontend": "cd frontend && pnpm build",
        "test": "cd frontend && pnpm build"
      },
      devDependencies: {}
    };

    writeFileSync(join(tempDir, 'package.json'), JSON.stringify(rootPackageJson, null, 2));

    spinner.succeed('Fullstack project scaffolded');
  } catch (err: unknown) {
    spinner.fail('Failed to scaffold fullstack project');
    dumpErr(err);
    throw err;
  }

  // Step 3: Initialize git repository
  console.log(chalk.bold('\nStep 3: Initializing git repository'));

  const gitSpinner = ora('Setting up git...').start();
  try {
    // Initialize git repo
    execSync('git init', { cwd: tempDir, stdio: ['pipe', 'pipe', 'pipe'] });

    // Set git identity
    execSync('git config user.name "noxdev"', { cwd: tempDir, stdio: ['pipe', 'pipe', 'pipe'] });
    execSync('git config user.email "noxdev@demo"', { cwd: tempDir, stdio: ['pipe', 'pipe', 'pipe'] });

    // Add and commit initial files
    execSync('git add .', { cwd: tempDir, stdio: ['pipe', 'pipe', 'pipe'] });
    execSync('git commit -m "Initial Vite scaffold"', { cwd: tempDir, stdio: ['pipe', 'pipe', 'pipe'] });

    gitSpinner.succeed('Git repository initialized');
  } catch (err: unknown) {
    gitSpinner.fail('Failed to initialize git repository');
    dumpErr(err);
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
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Create .noxdev/config.json
    const projectConfig: ProjectConfig = {
      project: projectName,
      display_name: projectName,
      test_command: "pnpm test",
      build_command: "pnpm build:frontend",
      lint_command: "cd frontend && pnpm lint",
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
      "pnpm build:frontend",
      "cd frontend && pnpm lint"
    );

    registerSpinner.succeed('Project registered with noxdev');
  } catch (err: unknown) {
    registerSpinner.fail('Failed to register project');
    dumpErr(err);
    throw err;
  }

  // Step 5: Copy demo tasks template
  console.log(chalk.bold('\nStep 5: Setting up demo tasks'));

  const tasksSpinner = ora('Copying demo tasks template...').start();
  try {
    const targetTasksPath = join(worktreePath, "TASKS.md");
    copyFileSync(demoTasksPath(), targetTasksPath);
    tasksSpinner.succeed('Demo tasks copied');
  } catch (err: unknown) {
    tasksSpinner.fail('Failed to copy demo tasks');
    dumpErr(err);
    throw err;
  }

  // Step 6: Install dependencies in worktree
  console.log(chalk.bold('\nStep 6: Installing dependencies'));

  const depsSpinner = ora('Installing dependencies with pnpm...').start();
  try {
    execSync('pnpm install', { cwd: worktreePath, stdio: ['pipe', 'pipe', 'pipe'] });
    depsSpinner.succeed('Dependencies installed');
  } catch (err: unknown) {
    depsSpinner.fail('Failed to install dependencies');
    dumpErr(err);
    throw err;
  }

  // Step 6.1: Sync Python backend deps
  const uvSpinner = ora('Syncing backend dependencies with uv...').start();
  try {
    execSync('uv sync', { cwd: join(worktreePath, 'backend'), stdio: ['pipe', 'pipe', 'pipe'] });
    uvSpinner.succeed('Backend dependencies synced');
  } catch (err: unknown) {
    uvSpinner.fail('Failed to sync backend dependencies');
    dumpErr(err);
    throw err;
  }

  // Step 7: Run noxdev on the project
  console.log(chalk.bold('\nStep 7: Running noxdev demo tasks autonomously'));
  console.log(chalk.cyan('🦉 Launching autonomous agent...\n'));

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
    dumpErr(err);
    throw err;
  }

  // Step 8: Show results
  console.log(chalk.bold('\n🎉 Demo complete!'));
  console.log('');
  console.log(chalk.green('✓ Fullstack React + FastAPI project scaffolded'));
  console.log(chalk.green('✓ Git repository initialized'));
  console.log(chalk.green('✓ Project registered with noxdev'));
  console.log(chalk.green('✓ Demo tasks executed autonomously'));
  console.log('');
  console.log(chalk.bold('What happened:'));
  console.log(chalk.gray('  • noxdev read the task specifications in TASKS.md'));
  console.log(chalk.gray('  • Claude Code built the todo app according to specs'));
  console.log(chalk.gray('  • Frontend, backend, and tests were created automatically'));
  console.log(chalk.gray('  • All changes were committed automatically'));
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log(chalk.gray(`  • Start frontend:       cd ${worktreePath}/frontend && pnpm dev`));
  console.log(chalk.gray(`  • Start backend:        cd ${worktreePath}/backend && uv run uvicorn main:app --reload --port 8000`));
  console.log(chalk.gray(`  • See the tasks: cat ${worktreePath}/TASKS.md`));
  console.log(chalk.gray(`  • Run more tasks: noxdev run ${projectName}`));
  console.log(chalk.gray('  • Review changes: noxdev dashboard'));
  console.log('');
  console.log(chalk.cyan('🦉 Welcome to fullstack autonomous development with noxdev!'));
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
    execSync('git add TASKS.md', { cwd: project.worktree_path, stdio: ['pipe', 'pipe', 'pipe'] });
    execSync('git commit -m "noxdev: update task statuses"', { cwd: project.worktree_path, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(chalk.gray('  ✓ TASKS.md status updates committed'));
  } catch (err: unknown) {
    // TASKS.md might not have changes, but dump error for debugging
    dumpErr(err);
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