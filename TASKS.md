# noxdev v1.0.1 — Distribution fix release

# Goal: Fix the gaps discovered during first external user install.
# - Ship the Dockerfile that was missing from the npm package
# - Add Node version enforcement to prevent Node 25+ compile failures
# - Add `noxdev setup` command to automate first-run experience
# - Add `noxdev demo` command for zero-friction product showcase
# - Simplify `noxdev doctor` recovery messages
#
# PREREQUISITES (must be in place BEFORE running this spec):
# 1. ~/projects/noxdev/docker/Dockerfile must exist
#    (copy from ~/.ccstate/docker/Dockerfile)
# 2. ~/projects/noxdev/packages/cli/templates/demo-tasks.md must exist
#    (the demo TASKS.md template, added manually)
#
# Gate between sessions: pnpm build && noxdev doctor
#
# Session 1: T1, T2 (Dockerfile shipping + engines field)
# Session 2: T3, T4 (noxdev setup command)
# Session 3: T5, T6, T7 (noxdev demo command)
# Session 4: T8, T9 (doctor cleanup + version bump)

## T1: Add canonical Dockerfile to repo and CLI build pipeline
- STATUS: done
- FILES: docker/Dockerfile, packages/cli/package.json
- VERIFY: pnpm build && [ -f packages/cli/docker/Dockerfile ] && grep -q "noxdev-runner\|ubuntu" packages/cli/docker/Dockerfile
- CRITIC: skip
- PUSH: auto
- SPEC: Add the Dockerfile to the noxdev repo and ensure it ships in the npm package.

  STEP 1: Verify the Dockerfile exists at docker/Dockerfile in the repo root.
  This file was added manually before this task spec was run. If it does
  NOT exist, STOP and report failure with message: "docker/Dockerfile must
  exist before running this task. Copy it from ~/.ccstate/docker/Dockerfile
  to ~/projects/noxdev/docker/Dockerfile first."

  STEP 2: Update packages/cli/package.json to ensure the Dockerfile gets
  copied into the CLI package at build time.

  Add a prebuild script that copies the Dockerfile from the repo root
  into packages/cli/docker/. The "files" array must include "docker"
  so the npm pack includes it.

  Find the existing "scripts" section and add OR update the prebuild script:
  ```json
  "scripts": {
    "prebuild": "mkdir -p docker && cp ../../docker/Dockerfile docker/Dockerfile",
    ...existing scripts...
  }
  ```

  If a prebuild script already exists, append the cp command with &&.

  Find the existing "files" array and add "docker" to it. The array
  should look like:
  ```json
  "files": [
    "dist",
    "scripts",
    "docker",
    "bin",
    "README.md",
    "LICENSE"
  ]
  ```

  Do NOT remove any existing entries from the files array.

  STEP 3: Run pnpm build and verify packages/cli/docker/Dockerfile exists
  after the build. Also verify that "cd packages/cli && npm pack --dry-run"
  includes the Dockerfile in its output.

  Do NOT modify the Dockerfile contents itself. The file is canonical
  as-is.

## T2: Add Node engines field to enforce LTS-only versions
- STATUS: done
- FILES: packages/cli/package.json, packages/cli/README.md, README.md
- VERIFY: pnpm build && grep -q '"engines"' packages/cli/package.json && grep -q "20.x\|22.x" packages/cli/README.md
- CRITIC: skip
- PUSH: auto
- SPEC: Add engines field to package.json to prevent installs on
  unsupported Node versions, and update README files to document this.

  STEP 1: Edit packages/cli/package.json. Add an "engines" field at the
  top level (sibling to "name", "version", "scripts", etc.):
  ```json
  "engines": {
    "node": ">=20.0.0 <23.0.0"
  }
  ```

  This prevents Node 23, 24, 25 users from hitting the better-sqlite3
  C++ compile wall. Only Node 20 LTS and Node 22 LTS are supported.

  STEP 2: Edit packages/cli/README.md. Find the Requirements section
  (looks like "## Requirements" or similar). Find the line that says
  "Node.js 18+" or similar. Replace it with exactly:

  - Node.js 20.x or 22.x (LTS only — Node 23+ not supported due to native
    dependency compatibility)

  STEP 3: Edit README.md at the repo root. Find the same Requirements
  section and apply the same replacement.

  Do NOT add any other dependencies. Do NOT modify the version number
  yet — that happens in T9.

## T3: Create noxdev setup command skeleton
- STATUS: done
- FILES: packages/cli/src/commands/setup.ts, packages/cli/src/index.ts
- VERIFY: pnpm build && node packages/cli/dist/index.js setup --help 2>&1 | grep -q "setup"
- CRITIC: skip
- PUSH: auto
- SPEC: Create the noxdev setup command. This task creates the skeleton
  and CLI wiring. T4 fills in the actual logic.

  STEP 1: Create packages/cli/src/commands/setup.ts with this exact
  starter content:
  ```typescript
  import chalk from 'chalk';
  import { execSync, spawnSync } from 'node:child_process';
  import fs from 'node:fs';
  import os from 'node:os';
  import path from 'node:path';

  interface SetupOptions {
    rebuild?: boolean;
    yes?: boolean;
  }

  export async function setupCommand(opts: SetupOptions = {}): Promise<void> {
    console.log(chalk.bold('\n🦉 noxdev setup\n'));
    console.log('This will:');
    console.log('  • Build the noxdev-runner Docker image (~3-5 min)');
    console.log('  • Verify SOPS + age are installed');
    console.log('  • Create ~/.noxdev/ config directory');
    console.log('  • Run noxdev doctor\n');

    // Implementation lives in T4
    console.log(chalk.yellow('setup command not yet implemented (T4)'));
  }
  ```

  STEP 2: Edit packages/cli/src/index.ts. Find where other commands like
  `init`, `run`, `status` are registered with commander. Add the setup
  command registration. It should look like:
  ```typescript
  import { setupCommand } from './commands/setup.js';

  program
    .command('setup')
    .description('Build Docker image and prepare noxdev for first use')
    .option('--rebuild', 'Force rebuild of Docker image even if it exists')
    .option('--yes', 'Skip confirmation prompts (for scripting)')
    .action(setupCommand);
  ```

  Match the existing import style and registration pattern in index.ts.
  Some files use ESM imports (.js extensions), some use CommonJS — match
  whatever the rest of the file uses.

  STEP 3: Verify with pnpm build, then run:
  node packages/cli/dist/index.js setup --help

  Should print the setup command help text including --rebuild and --yes.

## T4: Implement noxdev setup command logic
- STATUS: done
- FILES: packages/cli/src/commands/setup.ts
- VERIFY: pnpm build && node packages/cli/dist/index.js setup --yes 2>&1 | tee /tmp/noxdev-setup.log && grep -q "Setup complete\|setup complete" /tmp/noxdev-setup.log
- CRITIC: skip
- PUSH: gate
- SPEC: Implement the full noxdev setup command logic. This is the
  central feature of 1.0.1.

  Replace the placeholder body of setupCommand() in
  packages/cli/src/commands/setup.ts with the full implementation:

  STEP A: Prerequisite check (cannot continue without these)
  Check each of these in order. If ANY fail, exit with code 1 and a
  clear error message that includes the install command:

  1. Node version >= 20 and < 23
     - Use process.versions.node
     - On failure: "Node ${version} not supported. Install Node 20 or 22 LTS."
  2. Docker installed
     - Try execSync('docker --version', { stdio: 'pipe' })
     - On failure: "Docker not found. Install Docker Desktop:
       https://www.docker.com/products/docker-desktop/"
  3. Docker daemon running
     - Try execSync('docker ps', { stdio: 'pipe' })
     - On failure: "Docker daemon not running. Start Docker Desktop and try again."
  4. Git installed
     - Try execSync('git --version', { stdio: 'pipe' })
     - On failure: "Git not found. Install with: brew install git (macOS)
       or apt install git (Linux)"
  5. Claude Code CLI installed
     - Try execSync('claude --version', { stdio: 'pipe' })
     - On failure: "Claude Code CLI not found. Install with:
       npm install -g @anthropic-ai/claude-code"

  Print each check result with a green check or red cross. Use chalk.

  STEP B: Confirmation prompt (skip if --yes flag set)
  If opts.yes is false, prompt: "Continue? [Y/n] "
  Read from stdin using readline. Empty input or 'y'/'Y' means yes.
  'n'/'N' means no (exit cleanly with code 0 and "Setup cancelled" message).
  Do NOT add any new dependencies — use built-in node:readline.

  STEP C: Build Docker image (idempotent)
  Resolve the Dockerfile path: it ships in the CLI package at docker/Dockerfile.
  Use this resolution pattern:
  ```typescript
  // For ESM: const cliRoot = path.dirname(fileURLToPath(import.meta.url)) + '/..';
  // For CJS: const cliRoot = path.resolve(__dirname, '..', '..');
  const cliRoot = path.resolve(__dirname, '..', '..');
  const dockerfilePath = path.join(cliRoot, 'docker', 'Dockerfile');

  if (!fs.existsSync(dockerfilePath)) {
    console.error(chalk.red('✖ Dockerfile not found at ' + dockerfilePath));
    console.error(chalk.gray('  This is a noxdev install bug. Reinstall with:'));
    console.error(chalk.gray('  npm install -g @eugene218/noxdev'));
    process.exit(1);
  }
  ```

  Match whatever module system (ESM or CJS) the rest of the codebase uses.

  Check if image already exists:
  ```typescript
  let imageExists = false;
  try {
    execSync('docker image inspect noxdev-runner:latest', { stdio: 'pipe' });
    imageExists = true;
  } catch {
    imageExists = false;
  }
  ```

  If imageExists AND opts.rebuild is false: print
  "✓ Docker image already exists (use --rebuild to force)" and skip to step D.

  Otherwise build the image with live output streaming:
  ```typescript
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
  ```

  STEP D: Check SOPS + age (warn but do not fail)
  Try execSync('sops --version', { stdio: 'pipe' }) and
  execSync('age --version', { stdio: 'pipe' }).
  If either fails, print a warning with install commands for the
  current OS:
  - macOS (process.platform === 'darwin'): "brew install sops age"
  - Linux: "apt install sops age (or download from GitHub)"
  - Windows: "choco install sops age (or download from GitHub)"
  Do NOT exit. SOPS is optional for encrypted secrets only.

  STEP E: Create ~/.noxdev/ config directory (idempotent)
  ```typescript
  const noxdevDir = path.join(os.homedir(), '.noxdev');
  if (!fs.existsSync(noxdevDir)) {
    fs.mkdirSync(noxdevDir, { recursive: true });
    console.log(chalk.green('✓ Created ~/.noxdev/'));
  } else {
    console.log(chalk.green('✓ ~/.noxdev/ already exists'));
  }
  ```
  Do NOT create the SQLite ledger here — that is the job of `noxdev init`.

  STEP F: Final summary
  Print:
  ```
  ✅ Setup complete.

  Next steps:
    noxdev demo                     # See noxdev build a project autonomously
    noxdev init <name> --repo .     # Register an existing project
  ```

  Exit with code 0.

  IMPORTANT: This task uses PUSH: gate because it modifies the central
  user-facing command. Review the diff carefully before merging.

## T5: Create noxdev demo command skeleton and templates directory
- STATUS: done
- FILES: packages/cli/src/commands/demo.ts, packages/cli/src/index.ts, packages/cli/package.json
- VERIFY: pnpm build && node packages/cli/dist/index.js demo --help 2>&1 | grep -q "demo" && [ -f packages/cli/templates/demo-tasks.md ]
- CRITIC: skip
- PUSH: auto
- SPEC: Create the noxdev demo command skeleton and ensure the templates
  directory ships in the npm package.

  STEP 1: Verify packages/cli/templates/demo-tasks.md exists. This was
  added manually before this task spec ran. If it does NOT exist, STOP
  and fail with: "packages/cli/templates/demo-tasks.md must exist before
  running this task. Add the demo template manually."

  STEP 2: Create packages/cli/src/commands/demo.ts with this skeleton:
  ```typescript
  import chalk from 'chalk';
  import { execSync, spawnSync } from 'node:child_process';
  import fs from 'node:fs';
  import os from 'node:os';
  import path from 'node:path';

  interface DemoOptions {
    fresh?: boolean;
  }

  export async function demoCommand(opts: DemoOptions = {}): Promise<void> {
    console.log(chalk.bold('\n🦉 noxdev demo\n'));

    // Implementation lives in T6
    console.log(chalk.yellow('demo command not yet implemented (T6)'));
  }
  ```

  STEP 3: Edit packages/cli/src/index.ts to register the demo command.
  Match the same pattern as the setup command from T3:
  ```typescript
  import { demoCommand } from './commands/demo.js';

  program
    .command('demo')
    .description('Scaffold and run a demo project to see noxdev in action')
    .option('--fresh', 'Recreate the demo project from scratch')
    .action(demoCommand);
  ```

  STEP 4: Update packages/cli/package.json to include "templates" in the
  files array. Find the existing "files" array and add "templates":
  ```json
  "files": [
    "dist",
    "scripts",
    "docker",
    "templates",
    "bin",
    "README.md",
    "LICENSE"
  ]
  ```

  Do NOT remove any existing entries.

## T6: Implement noxdev demo command logic
- STATUS: done
- FILES: packages/cli/src/commands/demo.ts
- VERIFY: pnpm build && node packages/cli/dist/index.js demo --help 2>&1 | grep -q "fresh"
- CRITIC: skip
- PUSH: gate
- SPEC: Implement the full noxdev demo command. This command scaffolds
  a Vite + React + TypeScript project, registers it with noxdev, copies
  the demo tasks template, and runs noxdev to execute them.

  PREREQUISITE: packages/cli/templates/demo-tasks.md must exist. If it
  does not exist, STOP and fail with message:
  "packages/cli/templates/demo-tasks.md not found. The demo template
  must be added before running this task."

  Replace the placeholder body of demoCommand() with the full implementation:

  STEP A: Resolve demo project location
  Look for an existing db query helper in packages/cli/src/db/queries.ts
  for finding a project by name. Common helper names: getProjectByName,
  findProject, findProjectById. Use whichever exists.

  If NO helper exists, write an inline SQLite query using better-sqlite3:
  ```typescript
  import Database from 'better-sqlite3';
  function findDemoProject(): { repo_path: string; worktree_path: string } | null {
    const dbPath = path.join(os.homedir(), '.noxdev', 'ledger.db');
    if (!fs.existsSync(dbPath)) return null;
    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db.prepare("SELECT repo_path, worktree_path FROM projects WHERE id = ?").get('noxdev-demo') as any;
      return row || null;
    } finally {
      db.close();
    }
  }
  ```

  Then resolve the path:
  ```typescript
  function resolveDemoPath(): { repoPath: string; isReuse: boolean } {
    const existing = findDemoProject();
    if (existing) {
      return { repoPath: existing.repo_path, isReuse: true };
    }

    // First-time creation
    const userProjectsDir = path.join(os.homedir(), 'projects');
    if (fs.existsSync(userProjectsDir)) {
      return { repoPath: path.join(userProjectsDir, 'noxdev-demo'), isReuse: false };
    } else {
      const noxdevDemoDir = path.join(os.homedir(), '.noxdev', 'demo');
      fs.mkdirSync(noxdevDemoDir, { recursive: true });
      return { repoPath: path.join(noxdevDemoDir, 'noxdev-demo'), isReuse: false };
    }
  }
  ```

  Handle --fresh flag: if opts.fresh is true and the project exists,
  remove it from the SQLite ledger AND delete the worktree before
  proceeding to a fresh creation. Use noxdev's existing remove command
  via subprocess:
  ```typescript
  if (opts.fresh && findDemoProject()) {
    console.log(chalk.yellow('--fresh: removing existing demo project...'));
    spawnSync(process.execPath, [process.argv[1], 'remove', 'noxdev-demo'], { stdio: 'inherit' });
  }
  ```

  STEP B: If isReuse is true (and not --fresh), print
  "Demo project found at ${repoPath}. Running demo task..." and skip
  to STEP G (run noxdev). Otherwise continue with scaffolding.

  STEP C: Scaffold Vite project
  ```typescript
  console.log(chalk.cyan(`\n[1/6] Creating project at ${repoPath}...\n`));
  const parentDir = path.dirname(repoPath);
  fs.mkdirSync(parentDir, { recursive: true });

  const projectName = path.basename(repoPath);
  const result = spawnSync(
    'pnpm',
    ['create', 'vite@latest', projectName, '--', '--template', 'react-ts'],
    { cwd: parentDir, stdio: 'inherit' }
  );
  if (result.status !== 0) {
    console.error(chalk.red('Failed to scaffold Vite project. Is pnpm installed?'));
    process.exit(1);
  }
  ```

  STEP D: Install dependencies
  ```typescript
  console.log(chalk.cyan('\n[2/6] Installing dependencies...\n'));
  spawnSync('pnpm', ['install'], { cwd: repoPath, stdio: 'inherit' });
  ```

  STEP E: Initialize git with starter commit
  ```typescript
  console.log(chalk.cyan('\n[3/6] Initializing git...\n'));
  execSync('git init', { cwd: repoPath, stdio: 'pipe' });
  execSync('git add -A', { cwd: repoPath, stdio: 'pipe' });
  execSync('git -c user.email=demo@noxdev.local -c user.name=noxdev commit -m "init: vite react-ts scaffold"', {
    cwd: repoPath, stdio: 'pipe'
  });
  ```

  STEP F: Register with noxdev
  ```typescript
  console.log(chalk.cyan('\n[4/6] Registering with noxdev...\n'));
  const initResult = spawnSync(
    process.execPath,
    [process.argv[1], 'init', 'noxdev-demo', '--repo', repoPath],
    { stdio: 'inherit' }
  );
  if (initResult.status !== 0) {
    console.error(chalk.red('noxdev init failed'));
    process.exit(1);
  }
  ```

  STEP G: Copy demo tasks template into the worktree
  After noxdev init runs, the worktree exists at the path the SQLite
  ledger records. Look it up:
  ```typescript
  const project = findDemoProject();
  if (!project) {
    console.error(chalk.red('noxdev-demo project not found after init'));
    process.exit(1);
  }
  const worktreePath = project.worktree_path;

  console.log(chalk.cyan('\n[5/6] Copying demo task spec...\n'));
  const cliRoot = path.resolve(__dirname, '..', '..');
  const templatePath = path.join(cliRoot, 'templates', 'demo-tasks.md');
  if (!fs.existsSync(templatePath)) {
    console.error(chalk.red('Demo template not found at ' + templatePath));
    console.error(chalk.gray('This is a noxdev install bug.'));
    process.exit(1);
  }
  const tasksDestination = path.join(worktreePath, 'TASKS.md');
  fs.copyFileSync(templatePath, tasksDestination);
  console.log(chalk.green('✓ Demo tasks copied to ' + tasksDestination));
  ```

  STEP H: Run noxdev on the demo project
  ```typescript
  console.log(chalk.cyan('\n[6/6] Running demo tasks (autonomous)...\n'));
  const runResult = spawnSync(
    process.execPath,
    [process.argv[1], 'run', 'noxdev-demo'],
    { stdio: 'inherit' }
  );
  if (runResult.status !== 0) {
    console.error(chalk.red('Demo run failed. Check logs with: noxdev log'));
    process.exit(1);
  }
  ```

  STEP I: Final celebration message
  ```typescript
  console.log(chalk.bold.green('\n🎉 Demo complete!\n'));
  console.log('Your demo project is at:');
  console.log(chalk.cyan(`  ${repoPath}\n`));
  console.log('Next steps:');
  console.log(chalk.gray(`  cd ${repoPath}`));
  console.log(chalk.gray('  noxdev merge noxdev-demo    # review and merge the agent commits'));
  console.log(chalk.gray('  pnpm dev                    # run the demo locally'));
  console.log(chalk.gray('  noxdev dashboard            # visual review interface'));
  console.log(chalk.gray('\nWelcome to noxdev. 🦉\n'));
  ```

  PUSH: gate because this is a major user-facing command that needs review.

## T7: Verify demo template ships in npm package
- STATUS: done
- FILES: packages/cli/package.json
- VERIFY: cd packages/cli && npm pack --dry-run 2>&1 | grep -q "templates/demo-tasks.md"
- CRITIC: skip
- PUSH: auto
- SPEC: Verify the demo-tasks.md template ships in the npm package.

  STEP 1: Confirm packages/cli/templates/demo-tasks.md exists. If it
  does not, STOP and fail with: "demo-tasks.md must exist at
  packages/cli/templates/ before running this task."

  STEP 2: Verify packages/cli/package.json files array includes
  "templates" (added in T5). If missing, add it.

  STEP 3: Run "cd packages/cli && npm pack --dry-run" and verify the
  output includes "templates/demo-tasks.md".

  This task is mostly verification — T5 already added "templates" to
  the files array. This task confirms the actual demo template file
  will be included in the published tarball.

## T8: Simplify noxdev doctor recovery messages
- STATUS: done
- FILES: packages/cli/src/commands/doctor.ts
- VERIFY: pnpm build && node packages/cli/dist/index.js doctor 2>&1 | tee /tmp/noxdev-doctor.log; grep -q "noxdev setup\|Ready" /tmp/noxdev-doctor.log
- CRITIC: skip
- PUSH: auto
- SPEC: Update noxdev doctor to point users to "noxdev setup" instead of
  printing manual docker build commands.

  Find the section of doctor.ts that checks for the noxdev-runner Docker
  image. The current check looks something like:
  ```typescript
  // Current (verbose):
  console.log('[!] Docker image exists noxdev-runner image not found.');
  console.log('    Build it with: docker build -t noxdev-runner .');
  ```

  Replace the failure message with a single-line actionable hint:
  ```typescript
  console.log(chalk.yellow('[!] noxdev-runner image missing. Run: noxdev setup'));
  ```

  Also update the config directory failure message. Find:
  ```typescript
  // Current:
  console.log('[!] noxdev config directory No config directory.');
  console.log('    Run: noxdev init <project>');
  ```

  Replace with:
  ```typescript
  console.log(chalk.yellow('[!] noxdev config directory missing. Run: noxdev setup'));
  ```

  Leave the SQLite database failure message ALONE — SQLite IS created
  by `noxdev init` (not by setup), and the existing message is correct.

  Update the SOPS failure message to be optional/warning style. Find:
  ```typescript
  // Current:
  console.log('[!] SOPS installed SOPS not found. Secrets encryption unavailable.');
  ```

  Replace with:
  ```typescript
  console.log(chalk.gray('[~] SOPS not installed (optional, for encrypted secrets)'));
  ```

  Note the gray color and tilde marker [~] instead of [!] — this signals
  "informational, not a real failure."

  Do NOT change the prerequisite check messages (Node, Docker, Git,
  Claude credentials) — those are correct as-is.

## T9: Bump version to 1.0.1 and update CHANGELOG
- STATUS: done
- FILES: packages/cli/package.json, CHANGELOG.md
- VERIFY: grep -q '"version": "1.0.1"' packages/cli/package.json && grep -q "1.0.1" CHANGELOG.md
- CRITIC: skip
- PUSH: gate
- SPEC: Bump the noxdev CLI version to 1.0.1 and document the changes.

  STEP 1: Edit packages/cli/package.json. Change the "version" field
  from whatever it currently is (likely "1.0.0") to "1.0.1".

  STEP 2: Edit CHANGELOG.md at the repo root. Add a new section at the
  TOP of the file (immediately after any header), before the existing
  1.0.0 section:

  ```markdown
  ## 1.0.1 — 2026-04-09

  ### Fixed
  - Dockerfile now ships with the npm package (was missing in 1.0.0,
    causing fresh installs to fail at the doctor check)
  - Added engines field to enforce Node 20.x or 22.x LTS (prevents
    better-sqlite3 compile failures on Node 23+)
  - noxdev doctor now suggests `noxdev setup` instead of printing
    manual docker build commands
  - SOPS check is now informational only (was reported as failure)

  ### Added
  - `noxdev setup` command: idempotent first-run setup that builds
    the Docker image, verifies prerequisites, and creates the config
    directory. Supports --rebuild and --yes flags.
  - `noxdev demo` command: zero-friction product showcase that
    scaffolds a Vite + React + TypeScript project, registers it with
    noxdev, and runs a baked-in demo task spec autonomously. The
    user sees noxdev build a polished welcome page in under 3 minutes.
    Supports --fresh flag to recreate the demo from scratch.
  - Demo task spec template at templates/demo-tasks.md (shipped in
    the npm package)
  ```

  Do NOT touch any other CHANGELOG entries. Only prepend the new
  1.0.1 section.

  PUSH: gate because version bumps are the gate to publication.
  Review the entire diff carefully before merging this and running
  npm publish.
