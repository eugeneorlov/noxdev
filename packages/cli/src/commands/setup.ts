import type { Command } from "commander";
import chalk from "chalk";
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

interface SetupOptions {
  rebuild?: boolean;
  yes?: boolean;
}

export function registerSetup(program: Command): void {
  program
    .command("setup")
    .description("Build Docker image and prepare noxdev for first use")
    .option("--rebuild", "Force rebuild of Docker image even if it exists")
    .option("--yes", "Skip confirmation prompts (for scripting)")
    .action(async (opts: SetupOptions) => {
      try {
        await runSetup(opts);
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

async function runSetup(opts: SetupOptions = {}): Promise<void> {
  console.log(chalk.bold('\n🦉 noxdev setup\n'));

  // STEP A: Prerequisite checks
  console.log(chalk.cyan('Checking prerequisites...\n'));

  // 1. Node version check
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split('.')[0]);
  if (major < 20 || major >= 23) {
    console.error(chalk.red(`✖ Node ${nodeVersion} not supported. Install Node 20 or 22 LTS.`));
    process.exit(1);
  }
  console.log(chalk.green(`✓ Node ${nodeVersion} (supported)`));

  // 2. Docker installed check
  try {
    execSync('docker --version', { stdio: 'pipe' });
    console.log(chalk.green('✓ Docker installed'));
  } catch {
    console.error(chalk.red('✖ Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/'));
    process.exit(1);
  }

  // 3. Docker daemon running check
  try {
    execSync('docker ps', { stdio: 'pipe' });
    console.log(chalk.green('✓ Docker daemon running'));
  } catch {
    console.error(chalk.red('✖ Docker daemon not running. Start Docker Desktop and try again.'));
    process.exit(1);
  }

  // 4. Git installed check
  try {
    execSync('git --version', { stdio: 'pipe' });
    console.log(chalk.green('✓ Git installed'));
  } catch {
    console.error(chalk.red('✖ Git not found. Install with: brew install git (macOS) or apt install git (Linux)'));
    process.exit(1);
  }

  // 5. Claude Code CLI check
  try {
    execSync('claude --version', { stdio: 'pipe' });
    console.log(chalk.green('✓ Claude Code CLI installed'));
  } catch {
    console.error(chalk.red('✖ Claude Code CLI not found. Install with: npm install -g @anthropic-ai/claude-code'));
    process.exit(1);
  }

  // STEP B: Confirmation prompt (skip if --yes)
  if (!opts.yes) {
    console.log('\nThis will:');
    console.log('  • Build the noxdev-runner Docker image (~3-5 min)');
    console.log('  • Verify SOPS + age are installed');
    console.log('  • Create ~/.noxdev/ config directory');
    console.log('  • Run noxdev doctor\n');

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question('Continue? [Y/n] ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });

    if (answer.toLowerCase() === 'n') {
      console.log('\nSetup cancelled.');
      process.exit(0);
    }
  }

  // STEP C: Build Docker image (idempotent)
  const cliRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const dockerfilePath = path.join(cliRoot, 'docker', 'Dockerfile');

  if (!fs.existsSync(dockerfilePath)) {
    console.error(chalk.red('✖ Dockerfile not found at ' + dockerfilePath));
    console.error(chalk.gray('  This is a noxdev install bug. Reinstall with:'));
    console.error(chalk.gray('  npm install -g @eugene218/noxdev'));
    process.exit(1);
  }

  // Check if image already exists
  let imageExists = false;
  try {
    execSync('docker image inspect noxdev-runner:latest', { stdio: 'pipe' });
    imageExists = true;
  } catch {
    imageExists = false;
  }

  if (imageExists && !opts.rebuild) {
    console.log(chalk.green('\n✓ Docker image already exists (use --rebuild to force)'));
  } else {
    const dockerfileDir = path.dirname(dockerfilePath);
    console.log(chalk.cyan('\nBuilding noxdev-runner image (this takes 3-5 minutes)...\n'));
    const result = spawnSync('docker', ['build', '-t', 'noxdev-runner:latest', dockerfileDir], {
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      console.error(chalk.red('\n✖ Docker build failed.'));
      process.exit(1);
    }
    console.log(chalk.green('\n✓ Docker image built successfully'));
  }

  // STEP D: Check SOPS + age (warn but do not fail)
  let sopsInstalled = false;
  let ageInstalled = false;

  try {
    execSync('sops --version', { stdio: 'pipe' });
    sopsInstalled = true;
  } catch {
    // SOPS not installed
  }

  try {
    execSync('age --version', { stdio: 'pipe' });
    ageInstalled = true;
  } catch {
    // age not installed
  }

  if (sopsInstalled && ageInstalled) {
    console.log(chalk.green('\n✓ SOPS and age installed'));
  } else if (!sopsInstalled && !ageInstalled) {
    console.log(chalk.yellow('\n⚠ SOPS and age not installed (optional, for encrypted secrets)'));
    if (process.platform === 'darwin') {
      console.log(chalk.gray('  Install with: brew install sops age'));
    } else if (process.platform === 'linux') {
      console.log(chalk.gray('  Install with: apt install sops age (or download from GitHub)'));
    } else {
      console.log(chalk.gray('  Install with: choco install sops age (or download from GitHub)'));
    }
  } else if (!sopsInstalled) {
    console.log(chalk.yellow('\n⚠ SOPS not installed (optional, for encrypted secrets)'));
    if (process.platform === 'darwin') {
      console.log(chalk.gray('  Install with: brew install sops'));
    }
  } else if (!ageInstalled) {
    console.log(chalk.yellow('\n⚠ age not installed (optional, for encrypted secrets)'));
    if (process.platform === 'darwin') {
      console.log(chalk.gray('  Install with: brew install age'));
    }
  }

  // STEP E: Create ~/.noxdev/ config directory (idempotent)
  const noxdevDir = path.join(os.homedir(), '.noxdev');
  if (!fs.existsSync(noxdevDir)) {
    fs.mkdirSync(noxdevDir, { recursive: true });
    console.log(chalk.green('\n✓ Created ~/.noxdev/'));
  } else {
    console.log(chalk.green('\n✓ ~/.noxdev/ already exists'));
  }

  // STEP F: Final summary
  console.log(chalk.bold.green('\n✅ Setup complete.\n'));
  console.log('Next steps:');
  console.log('  noxdev demo                     # See noxdev build a project autonomously');
  console.log('  noxdev init <name> --repo .     # Register an existing project\n');
}