# noxdev v1.0.4 — Fullstack Python + React Demo

## T1: Auto-detect project type in noxdev init from manifest files
- STATUS: done
- FILES: packages/cli/src/commands/init.ts, packages/cli/src/lib/projectType.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js init --help | grep -i type
- CRITIC: skip
- PUSH: auto
- SPEC: Add automatic project type detection to noxdev init based on
  filesystem manifest files. This replaces hardcoded pnpm defaults with
  smart detection.

  Step 1: Create packages/cli/src/lib/projectType.ts:

  ```typescript
  import { existsSync } from 'node:fs';
  import { join } from 'node:path';

  export type ProjectType = 'node' | 'python' | 'fullstack' | 'blank';

  export function detectProjectType(repoPath: string): ProjectType {
    const hasNode = existsSync(join(repoPath, 'package.json'));
    const hasPython =
      existsSync(join(repoPath, 'pyproject.toml')) ||
      existsSync(join(repoPath, 'requirements.txt')) ||
      existsSync(join(repoPath, 'setup.py'));
    const hasFrontendDir = existsSync(join(repoPath, 'frontend', 'package.json'));
    const hasBackendDir =
      existsSync(join(repoPath, 'backend', 'pyproject.toml')) ||
      existsSync(join(repoPath, 'backend', 'requirements.txt'));

    if (hasFrontendDir && hasBackendDir) return 'fullstack';
    if (hasNode && hasPython) return 'fullstack';
    if (hasNode) return 'node';
    if (hasPython) return 'python';
    return 'blank';
  }
  ```

  Step 2: In packages/cli/src/commands/init.ts, add a `--type` option:

  ```typescript
  .option('--type <type>', 'Project type: node, python, fullstack, blank (auto-detected)')
  ```

  Step 3: Import detectProjectType and use it in the init action:

  ```typescript
  import { detectProjectType, type ProjectType } from '../lib/projectType.js';

  // In the action, after validating repoPath:
  const projectType: ProjectType = (opts.type as ProjectType) || detectProjectType(repoPath);
  console.log(chalk.gray(`  Project type: ${projectType}`));
  ```

  Step 4: Pass projectType to the config generation step (next task uses it).

## T2: Generate type-specific config defaults in noxdev init
- STATUS: done
- FILES: packages/cli/src/commands/init.ts, packages/cli/src/lib/configDefaults.ts
- VERIFY: cd packages/cli && pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: Generate sensible default test/build/lint commands based on project type.

  Step 1: Create packages/cli/src/lib/configDefaults.ts:

  ```typescript
  import type { ProjectType } from './projectType.js';
  import type { ProjectConfig } from '../config/types.js';

  export function getConfigDefaults(
    projectName: string,
    projectType: ProjectType,
  ): Partial<ProjectConfig> {
    const base = {
      project: projectName,
      display_name: projectName,
      tasks_file: 'TASKS.md',
      docker: { memory: '4g', cpus: 2, timeout_minutes: 30 },
      secrets: '',
      critic_default: 'review',
      push_default: 'gate',
    };

    switch (projectType) {
      case 'node':
        return {
          ...base,
          test_command: 'pnpm test',
          build_command: 'pnpm build',
          lint_command: 'pnpm lint',
        };
      case 'python':
        return {
          ...base,
          test_command: 'uv run pytest',
          build_command: 'uv build',
          lint_command: 'uv run ruff check --fix',
        };
      case 'fullstack':
        return {
          ...base,
          test_command: 'cd frontend && pnpm test && cd ../backend && uv run pytest',
          build_command: 'cd frontend && pnpm build && cd ../backend && uv build',
          lint_command: 'cd frontend && pnpm lint && cd ../backend && uv run ruff check --fix',
        };
      case 'blank':
      default:
        return {
          ...base,
          test_command: 'echo "no test command configured"',
          build_command: 'echo "no build command configured"',
          lint_command: 'echo "no lint command configured"',
        };
    }
  }
  ```

  Step 2: In init.ts, replace the hardcoded pnpm config block with a call
  to getConfigDefaults(projectName, projectType). The resulting config
  object is what gets written to .noxdev/config.json.

  Step 3: Verify by running noxdev init on a folder with pyproject.toml
  and confirming the generated config has uv commands.

## T3: Support compound commands in noxdev run (frontend && backend)
- STATUS: done
- FILES: packages/cli/src/engine/orchestrator.ts
- VERIFY: cd packages/cli && pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: noxdev already runs test_command, build_command, lint_command via
  shell. Compound commands using && should already work since they pass
  through to bash. This task is to verify that and add explicit shell
  invocation if needed.

  Step 1: Find where test_command/build_command/lint_command are executed
  in packages/cli/src/engine/orchestrator.ts (or wherever the run logic
  invokes them). Look for execSync calls with the config commands.

  Step 2: Verify the execSync uses { shell: '/bin/bash' } or similar so
  that && operators work. If not, add shell: true to the options:

  ```typescript
  execSync(projectConfig.test_command, {
    cwd: worktreeDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: '/bin/bash',
  });
  ```

  Step 3: No new code if it already works. Just confirm and document.

## T4: Rewrite noxdev demo to scaffold fullstack React + FastAPI app
- STATUS: done
- FILES: packages/cli/src/commands/demo.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js demo --help
- CRITIC: skip
- PUSH: auto
- SPEC: Replace the current Vite-only demo with a fullstack scaffold:
  React frontend + FastAPI backend in nested folders.

  Project structure to create:
  ```
  /tmp/noxdev-demo/
  ├── frontend/   (Vite React TS)
  ├── backend/    (FastAPI + uv)
  ├── README.md
  └── .git/
  ```

  Step 1: Keep the existing auto-cleanup logic at the top of runDemo().

  Step 2: Replace Step 2 (Vite scaffold) with TWO scaffolds:

  ```typescript
  // Step 2a: Scaffold frontend (Vite React)
  console.log(chalk.bold('\nStep 2: Scaffolding frontend (Vite React TS)'));
  const frontendSpinner = ora('Creating React app...').start();
  try {
    mkdirSync(tempDir, { recursive: true });
    execSync(`pnpm dlx create-vite@latest frontend --template react-ts`, {
      cwd: tempDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    frontendSpinner.succeed('Frontend scaffolded');
  } catch (err: unknown) {
    frontendSpinner.fail('Failed to scaffold frontend');
    dumpErr(err);
    throw err;
  }

  // Step 2b: Scaffold backend (FastAPI + uv)
  console.log(chalk.bold('\nStep 3: Scaffolding backend (FastAPI + uv)'));
  const backendSpinner = ora('Creating FastAPI app...').start();
  try {
    const backendDir = join(tempDir, 'backend');
    mkdirSync(backendDir, { recursive: true });
    execSync('uv init --app .', { cwd: backendDir, stdio: ['pipe', 'pipe', 'pipe'] });
    execSync('uv add fastapi uvicorn', { cwd: backendDir, stdio: ['pipe', 'pipe', 'pipe'] });
    execSync('uv add --dev pytest httpx', { cwd: backendDir, stdio: ['pipe', 'pipe', 'pipe'] });
    backendSpinner.succeed('Backend scaffolded');
  } catch (err: unknown) {
    backendSpinner.fail('Failed to scaffold backend');
    dumpErr(err);
    throw err;
  }
  ```

  Step 3: Update Step 4 (register project) to use type 'fullstack' so
  config defaults pull from getConfigDefaults('noxdev-demo', 'fullstack').

  Step 4: Update the install dependencies step to install for both:

  ```typescript
  execSync('pnpm install', { cwd: join(worktreePath, 'frontend'), stdio: ['pipe', 'pipe', 'pipe'] });
  execSync('uv sync', { cwd: join(worktreePath, 'backend'), stdio: ['pipe', 'pipe', 'pipe'] });
  ```

  Step 5: After the agent run completes, START BOTH SERVERS in the
  background and print URLs:

  ```typescript
  console.log(chalk.bold('\n🚀 Starting servers...'));
  const backendProc = spawn('uv', ['run', 'uvicorn', 'main:app', '--port', '8000'], {
    cwd: join(worktreePath, 'backend'),
    detached: true,
    stdio: 'ignore',
  });
  backendProc.unref();

  const frontendProc = spawn('pnpm', ['dev'], {
    cwd: join(worktreePath, 'frontend'),
    detached: true,
    stdio: 'ignore',
  });
  frontendProc.unref();

  // Give them a moment to start
  await new Promise(r => setTimeout(r, 3000));

  console.log(chalk.green('  ✓ Backend running:  http://localhost:8000'));
  console.log(chalk.green('  ✓ Frontend running: http://localhost:5173'));
  console.log(chalk.gray('  Stop with: pkill -f "uvicorn main:app" && pkill -f "vite"'));
  ```

  Important: do NOT block on the servers. They run detached. The demo
  command exits immediately after printing the URLs.

## T5: Fullstack demo TASKS.md template (3 tasks, 5-min budget)
- STATUS: done
- FILES: packages/cli/templates/demo-tasks.md
- VERIFY: ls packages/cli/templates/demo-tasks.md && grep -c "^## T" packages/cli/templates/demo-tasks.md
- CRITIC: skip
- PUSH: auto
- SPEC: Replace the current Vite-only demo template with a fullstack
  template. Three tasks, ~60 seconds each, demonstrating both languages.

  Replace packages/cli/templates/demo-tasks.md with:

  ```markdown
  # noxdev fullstack demo

  ## T1: Add /api/hello endpoint to FastAPI backend
  - STATUS: pending
  - FILES: backend/main.py, backend/test_main.py
  - VERIFY: cd backend && uv run pytest
  - CRITIC: skip
  - PUSH: auto
  - SPEC: Replace the contents of backend/main.py with a FastAPI app that
    exposes a single GET endpoint at /api/hello returning JSON:

    ```python
    from fastapi import FastAPI

    app = FastAPI()

    @app.get("/api/hello")
    def hello():
        return {"message": "Hello from noxdev fullstack demo"}
    ```

    Then create backend/test_main.py with a pytest test using FastAPI's
    TestClient:

    ```python
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    def test_hello():
        response = client.get("/api/hello")
        assert response.status_code == 200
        assert response.json() == {"message": "Hello from noxdev fullstack demo"}
    ```

  ## T2: Wire React frontend to fetch from FastAPI backend
  - STATUS: pending
  - FILES: frontend/src/App.tsx, frontend/vite.config.ts
  - VERIFY: cd frontend && pnpm build
  - CRITIC: skip
  - PUSH: auto
  - SPEC: Replace frontend/src/App.tsx with a component that fetches
    /api/hello on mount and displays the message in a centered card with
    a gradient background. Use useEffect and useState. Handle loading
    and error states gracefully.

    Update frontend/vite.config.ts to add a proxy that forwards /api
    requests to http://localhost:8000:

    ```typescript
    import { defineConfig } from 'vite';
    import react from '@vitejs/plugin-react';

    export default defineConfig({
      plugins: [react()],
      server: {
        proxy: {
          '/api': {
            target: 'http://localhost:8000',
            changeOrigin: true,
          },
        },
      },
    });
    ```

    The page should display "Hello from noxdev fullstack demo" prominently
    once the API call resolves. Use Tailwind-friendly inline styles or
    plain CSS in App.css — do NOT install any new dependencies.

  ## T3: Add root README.md explaining what noxdev built
  - STATUS: pending
  - FILES: README.md
  - VERIFY: test -f README.md && grep -q "FastAPI" README.md
  - CRITIC: skip
  - PUSH: auto
  - SPEC: Create a README.md at the project root (not in frontend/ or
    backend/) that briefly explains:
    - What this project is (a fullstack demo built autonomously by noxdev)
    - The architecture (Vite React frontend + FastAPI backend)
    - How to start it manually:
      ```
      cd backend && uv run uvicorn main:app --port 8000
      cd frontend && pnpm dev
      ```
    - A note that noxdev wrote all the code while you slept

    Keep it under 30 lines. Markdown headers and code blocks only.
  ```

## T6: Add Python informational checks to noxdev doctor
- STATUS: done
- FILES: packages/cli/src/commands/doctor.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js doctor
- CRITIC: skip
- PUSH: auto
- SPEC: Add two informational (non-blocking) checks to noxdev doctor:
  python3 version and uv version. Neither is required for noxdev itself
  (the Docker image has them) but they're useful context.

  Find the existing checks array in doctor.ts. Add after the Node check:

  ```typescript
  // Python (informational)
  checks.push(runCheck('Python 3 (informational)', false, () => {
    try {
      const v = execSync('python3 --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      return { passed: true, message: v };
    } catch {
      return { passed: true, message: 'not installed (Docker image has it)' };
    }
  }));

  // uv (informational)
  checks.push(runCheck('uv (informational)', false, () => {
    try {
      const v = execSync('uv --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      return { passed: true, message: v };
    } catch {
      return { passed: true, message: 'not installed (Docker image has it)' };
    }
  }));
  ```

  The `false` parameter means "informational only — does not affect overall pass/fail."
  If runCheck doesn't support that flag, add it: a third boolean argument
  that excludes the check from the failed-count totals.

## T7: README "Works with" section + fullstack demo screenshot
- STATUS: done
- FILES: README.md
- VERIFY: grep -q "Python" README.md && grep -q "FastAPI" README.md
- CRITIC: skip
- PUSH: auto
- SPEC: Update the main README.md to add a "Works with" section after the
  Quickstart. Show that noxdev is language-agnostic with TypeScript and
  Python as the proven paths.

  Add this section after the Quickstart section:

  ```markdown
  ## Works with

  noxdev is language-agnostic — the agent inside the Docker container can
  work with any language Claude Code supports. The first-class proven paths:

  - **TypeScript / Node** (pnpm, vitest, eslint)
  - **Python** (uv, pytest, ruff)
  - **Fullstack** (React + FastAPI in the same repo)

  See `noxdev demo` for a working fullstack example built autonomously
  in under 5 minutes.
  ```

  Do not modify any other section.

## T8: Version bump to 1.0.4 and CHANGELOG entry
- STATUS: done
- FILES: packages/cli/package.json, packages/cli/CHANGELOG.md
- VERIFY: cd packages/cli && pnpm build && node dist/index.js --version | grep "1.0.4"
- CRITIC: skip
- PUSH: auto
- SPEC: Bump version to 1.0.4 and add CHANGELOG entry.

  Step 1: In packages/cli/package.json, update version field to "1.0.4".

  Step 2: In packages/cli/CHANGELOG.md, add at the top after the title
  and before the 1.0.3 entry:

  ```markdown
  ## [1.0.4] - 2026-04-11

  ### Added
  - Project type auto-detection in `noxdev init` (node, python, fullstack, blank)
    based on manifest files (package.json, pyproject.toml, etc.)
  - `--type` flag on `noxdev init` to override detection
  - Type-specific config defaults: pnpm for node, uv for python, compound
    commands for fullstack
  - Python and uv informational checks in `noxdev doctor`
  - Fullstack React + FastAPI demo: `noxdev demo` now scaffolds both
    frontend and backend, runs three tasks (Python endpoint, React fetch,
    glue README), and starts both dev servers automatically

  ### Changed
  - `noxdev demo` is now a fullstack showcase (React + FastAPI) instead of
    a Vite-only scaffold. Demonstrates language-agnostic core with
    TypeScript and Python as proven paths.
  - Demo TASKS.md template rewritten for fullstack flow
  - Docker image now includes Python 3 and uv (manual rebuild required)

  ### Notes
  - Demo is designed to complete in under 5 minutes on a typical dev machine
  - To rebuild Docker image after upgrade: `noxdev setup --rebuild`
  ```

  Do not publish to npm in this task — that's a manual step.
