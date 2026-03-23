# noxdev Phase E: v1 Polish & Ship

# Dependencies: Phase D complete (dashboard working), manual bugfixes merged
# Gate between sessions: pnpm build && pnpm test
#
# Session 1: T1 (critic auth fix — test manually after)
# Session 2: T2, T3 (CLI branding — doctor + ASCII owl + version)
# Session 3: T4, T5 (dashboard polish — theme toggle + owl branding)
# Session 4: T6 (npm publish prep — bundled dashboard, package metadata)
# Session 5: T7, T8 (docs — README + LICENSE + CHANGELOG)
#
# IMPORTANT: After T1 lands, run a real task with CRITIC: review to validate the fix.
# After T6 lands, test: npm pack && npm install -g noxdev-0.1.0.tgz && noxdev --help

## T1: Fix critic agent auth — credential snapshot before Docker runs
- STATUS: done
- FILES: packages/cli/src/commands/run.ts, packages/cli/scripts/docker-run-max.sh, packages/cli/scripts/docker-run-api.sh
- VERIFY: pnpm build
- CRITIC: skip
- PUSH: gate
- SPEC: Fix the critic agent authentication failure. The bug: the developer agent's
  Docker container moves ~/.claude.json to a backup location (~/.claude/backups/).
  When the critic agent runs in a second container, the credentials are gone.
  Fix with a two-part credential snapshot approach:
  Part 1 — In packages/cli/src/commands/run.ts, BEFORE the task loop starts
  (before the for-of loop that iterates tasks), add a credential snapshot step:
  ```
  import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
  const claudeJsonSrc = path.join(os.homedir(), '.claude.json');
  const snapshotDir = path.join(os.homedir(), '.noxdev');
  const claudeSnapshot = path.join(snapshotDir, '.claude-snapshot.json');
  if (existsSync(claudeJsonSrc)) {
    mkdirSync(snapshotDir, { recursive: true });
    copyFileSync(claudeJsonSrc, claudeSnapshot);
    console.log(chalk.dim('  Credential snapshot saved'));
  }
  ```
  Part 2 — In BOTH packages/cli/scripts/docker-run-max.sh AND docker-run-api.sh,
  add a credential restore step at the VERY TOP of the script, before the docker run:
  ```
  CRED_SNAPSHOT="$HOME/.noxdev/.claude-snapshot.json"
  if [ -f "$CRED_SNAPSHOT" ]; then
    cp "$CRED_SNAPSHOT" "$HOME/.claude.json"
  fi
  ```
  This ensures that before EVERY Docker container (developer OR critic), the
  credentials are restored from the snapshot taken at run start. The snapshot is
  taken once per run, before any container can corrupt the original file.
  Do NOT change anything else in run.ts or the Docker scripts. The existing
  Docker mount pattern, volume mounts, and Claude Code flags are battle-tested.

## T2: noxdev doctor — prerequisite checker command
- STATUS: done
- FILES: packages/cli/src/commands/doctor.ts, packages/cli/src/index.ts
- VERIFY: pnpm build && node packages/cli/dist/index.js doctor
- CRITIC: skip
- PUSH: auto
- SPEC: Create a "noxdev doctor" command that checks all prerequisites for running noxdev.
  File: packages/cli/src/commands/doctor.ts
  Register as a new subcommand in packages/cli/src/index.ts (import and register
  alongside the existing commands, same pattern as init/run/status/etc).
  The doctor command runs these checks in order, printing pass/fail for each:
  1. Node.js version >= 18: check process.version, parse major. Pass: green checkmark.
     Fail: red X + "Node.js 18+ required, found {version}"
  2. Docker installed: run "docker --version" via child_process.execSync in try/catch.
     Pass: green checkmark + version string. Fail: red X + "Docker not found. Install: https://docs.docker.com/get-docker/"
  3. Docker daemon running: run "docker info" via execSync in try/catch.
     Pass: green checkmark. Fail: red X + "Docker daemon not running. Start Docker Desktop or run: sudo systemctl start docker"
  4. Docker image exists: run "docker images -q noxdev-runner:latest" via execSync.
     Pass if output is non-empty: green checkmark. Fail: yellow warning +
     "noxdev-runner image not found. Build it with: docker build -t noxdev-runner ."
  5. noxdev config directory: check if ~/.noxdev/ exists. Pass: green checkmark.
     Fail: yellow warning + "No config directory. Run: noxdev init <project>"
  6. SQLite database: check if ~/.noxdev/ledger.db exists and is readable. Try opening
     with better-sqlite3 and running "SELECT count(*) FROM projects". Pass: green checkmark +
     "{n} projects registered". Fail: yellow warning + "No database. Run: noxdev init <project>"
  7. Git installed: run "git --version" via execSync. Pass: green checkmark. Fail: red X.
  8. SOPS installed: run "sops --version" via execSync. Pass: green checkmark.
     Fail: yellow warning + "SOPS not found. Secrets encryption unavailable."
  9. Claude credentials: check if ~/.claude.json exists. Pass: green checkmark.
     Fail: red X + "Claude credentials not found. Run: claude login"
  Use chalk for colored output. Format: "[✓] Check name" (green) or "[✗] Check name" (red)
  or "[!] Check name" (yellow for warnings that don't block operation).
  At the end, print a summary: "X/9 checks passed. {ready|issues found}"
  Exit code 0 if all critical checks pass (Node, Docker installed, Docker running, Git, Claude creds).
  Exit code 1 if any critical check fails.

## T3: CLI ASCII art owl header and --version flag
- STATUS: done
- FILES: packages/cli/src/index.ts, packages/cli/src/brand.ts, packages/cli/package.json
- VERIFY: pnpm build && node packages/cli/dist/index.js --version && node packages/cli/dist/index.js --help
- CRITIC: skip
- PUSH: auto
- SPEC: Add branding to the noxdev CLI.
  File: packages/cli/src/brand.ts — Create a new file exporting the brand constants:
  Export const OWL_ASCII as this exact string (preserve indentation with spaces):
  ```
     ,___,
     [O.O]
    /)   )\
   " \|/ "
  ---m-m---
  ```
  Export const BANNER that combines the owl + text:
  ```
     ,___,
     [O.O]       noxdev v{version}
    /)   )\      ship code while you sleep
   " \|/ "
  ---m-m---
  ```
  The {version} placeholder gets replaced at runtime with the actual version from package.json.
  Export const TAGLINE = "🦉 noxdev — ship code while you sleep"
  File: packages/cli/src/index.ts — Make these changes:
  1. Add .version() to the commander program using the version from package.json.
     Import { readFileSync } from 'node:fs' and read the version from the built package.json,
     or hardcode "0.1.0" and update it before publish.
  2. When noxdev is invoked with NO subcommand (just "noxdev" with no args), print the
     full BANNER in muted gold/yellow color using chalk.hex('#C9A84C'), then print the
     help text. This replaces the default commander help-only output.
  3. When noxdev is invoked with a subcommand (like "noxdev run"), do NOT print the banner.
     Only the bare "noxdev" invocation shows the owl.
  Update packages/cli/package.json version to "0.1.0".

## T4: Dashboard dark/light theme toggle
- STATUS: done
- FILES: packages/dashboard/tailwind.config.ts, packages/dashboard/src/App.tsx, packages/dashboard/src/components/ThemeToggle.tsx, packages/dashboard/src/styles/globals.css
- VERIFY: cd packages/dashboard && pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: Add dark mode support to the dashboard with a toggle button.
  File: packages/dashboard/tailwind.config.ts — Add darkMode: 'class' to the config.
  File: packages/dashboard/src/styles/globals.css — Add dark mode CSS variables.
  Under the existing :root variables, add:
  ```css
  :root {
    --nox-bg: #ffffff;
    --nox-surface: #f9fafb;
    --nox-text: #111827;
    --nox-text-muted: #6b7280;
    --nox-border: #e5e7eb;
  }
  .dark {
    --nox-bg: #0f0f1a;
    --nox-surface: #1a1a2e;
    --nox-text: #e5e7eb;
    --nox-text-muted: #9ca3af;
    --nox-border: #2d2d44;
    --nox-owl: #C9A84C;
  }
  body {
    background-color: var(--nox-bg);
    color: var(--nox-text);
  }
  ```
  File: packages/dashboard/src/components/ThemeToggle.tsx
  A toggle button component. Uses React useState initialized from localStorage
  key 'noxdev-theme' (default: 'light'). On toggle, adds/removes 'dark' class
  on document.documentElement and saves preference to localStorage.
  Icon: use lucide-react Sun icon for light mode, Moon icon for dark mode.
  Styled as a round button in the header bar: p-2 rounded-full hover:bg-gray-100
  dark:hover:bg-gray-800 transition-colors.
  File: packages/dashboard/src/App.tsx — Import ThemeToggle and add it to the
  header/nav area, right-aligned next to the existing navigation links.
  Also add useEffect on mount to check localStorage and apply 'dark' class
  if the saved preference is 'dark'.
  Update ALL existing page and component files to use dark: variants on key elements:
  - Card backgrounds: bg-white dark:bg-[var(--nox-surface)]
  - Card borders: border-gray-200 dark:border-[var(--nox-border)]
  - Text: text-gray-900 dark:text-gray-100
  - Muted text: text-gray-500 dark:text-gray-400
  - Hover states: hover:bg-gray-50 dark:hover:bg-gray-800
  - The layout background: bg-gray-50 dark:bg-[var(--nox-bg)]
  Focus on the main visible elements — cards, headers, badges, the layout wrapper.
  Don't miss the StatusBadge component (it needs dark-friendly colors too).

## T5: Dashboard owl logo and footer branding
- STATUS: done
- FILES: packages/dashboard/src/App.tsx, packages/dashboard/public/owl-logo.svg
- VERIFY: cd packages/dashboard && pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: Add the owl logo to the dashboard header and update footer branding.
  File: packages/dashboard/public/owl-logo.svg — Create an SVG owl logo.
  Design a simple, clean owl face icon in SVG (32x32 viewBox). The owl should have:
  - Round head shape
  - Two large circular eyes with the muted gold color #C9A84C for the irises
  - Small triangular beak
  - Two small ear tufts at the top
  - Dark outline strokes (#1a1a2e for light mode compatibility)
  Keep it minimal and geometric — it needs to look good at 24px and 48px.
  File: packages/dashboard/src/App.tsx — Update the header:
  1. Replace the owl emoji in the header with an <img> tag loading /owl-logo.svg
     at 28px height. Add alt="noxdev owl logo".
  2. Update the footer to: 🦉 noxdev — ship code while you sleep
     Style the owl emoji slightly larger. Add a subtle gold color to "noxdev" using
     the --nox-owl CSS variable. Keep "ship code while you sleep" in muted text.
  3. Make sure the header logo + text link to the Overview page (/).

## T6: npm publish preparation — bundle dashboard, package metadata
- STATUS: done
- FILES: packages/cli/package.json, packages/cli/tsup.config.ts, packages/cli/src/commands/dashboard.ts
- VERIFY: cd packages/cli && pnpm build && ls dist/dashboard/index.html && node dist/index.js dashboard --help
- CRITIC: review
- PUSH: gate
- SPEC: Prepare the CLI package for npm publish as a standalone installable.
  The key change: bundle the dashboard build output INSIDE the CLI dist/ so that
  "npm install -g noxdev" gives users both the CLI and the dashboard.
  Part 1 — Update packages/cli/package.json:
  Change "name" from "@noxdev/cli" to "noxdev".
  Add these fields:
  ```json
  "description": "Autonomous overnight coding agent orchestrator — ship code while you sleep",
  "keywords": ["cli", "ai", "coding-agent", "docker", "autonomous", "claude", "devtools"],
  "author": "Eugene Orlov",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/eugeneorlov/noxdev"
  },
  "homepage": "https://github.com/eugeneorlov/noxdev",
  "engines": { "node": ">=18.0.0" },
  "files": ["dist/", "scripts/", "README.md", "LICENSE"]
  ```
  Part 2 — Update the postbuild script in packages/cli/package.json:
  Change from: "postbuild": "rm -rf dist/scripts && cp -r scripts dist/scripts"
  To: "postbuild": "rm -rf dist/scripts && cp -r scripts dist/scripts && rm -rf dist/dashboard && cp -r ../dashboard/dist dist/dashboard"
  This copies the built dashboard (Vite output) into cli/dist/dashboard/.
  The Turborepo build pipeline ensures dashboard builds before CLI, so the files exist.
  Part 3 — Update packages/cli/src/commands/dashboard.ts:
  Change the dashboard path resolution. Currently it resolves relative to the monorepo.
  For npm global installs, the dashboard is bundled at dist/dashboard/.
  Replace the dashboardDir resolution with:
  ```typescript
  // Look for bundled dashboard first (npm global install), then monorepo path (dev)
  const bundledDashboard = path.resolve(import.meta.dirname, '..', 'dashboard');
  const monorepoDevDashboard = path.resolve(import.meta.dirname, '..', '..', '..', 'packages', 'dashboard');
  const dashboardDir = existsSync(path.join(bundledDashboard, 'index.html'))
    ? bundledDashboard
    : monorepoDevDashboard;
  ```
  For the bundled case, the dashboard is pre-built static files — no Vite dev server needed.
  Change the UI server logic: if the dashboard dir contains index.html directly (bundled),
  serve it with a simple Express static file server instead of spawning Vite:
  ```typescript
  import express from 'express';
  // ... inside the action handler:
  if (existsSync(path.join(dashboardDir, 'index.html'))) {
    // Bundled mode: serve static files from the same Express server
    // Add static file serving to the API server instead of a separate process
  }
  ```
  Actually, the simplest approach for v1: serve the dashboard static files from the
  SAME Express server as the API. Update the API server (or the dashboard command)
  to mount express.static(dashboardDir) at '/' AFTER the /api routes. Then only
  one server process is needed (port 4400). The API serves /api/* routes, and
  serves the React SPA for everything else.
  For the monorepo dev case, keep the existing Vite dev server behavior.
  Remove the check for dist/api/server.js — in bundled mode, the dashboard command
  starts its own Express server inline (not from a separate built file).
  Part 4 — Make sure turbo.json has the correct dependency. The CLI build must
  depend on the dashboard build. In turbo.json, update the build pipeline:
  ```json
  "build": {
    "dependsOn": ["^build"]
  }
  ```
  This ensures pnpm build always builds dashboard first, then CLI (which copies
  dashboard dist into its own dist/).

## T7: README.md with architecture diagram, quick start, and installation
- STATUS: done
- FILES: README.md, LICENSE
- VERIFY: cat README.md | head -5
- CRITIC: review
- PUSH: gate
- SPEC: Create the README.md at the monorepo root and add MIT LICENSE.
  File: LICENSE — Standard MIT license, copyright 2026 Eugene Orlov.
  File: README.md — Structure it as follows:
  Section 1: Header
  - The owl ASCII art (same as brand.ts) centered
  - "noxdev" as h1
  - Tagline: "Ship code while you sleep" as subtitle
  - Badges: npm version, license MIT, node >=18 (use shields.io badge URLs)
  Section 2: What is noxdev (one paragraph)
  An open-source Node.js CLI that orchestrates autonomous coding agents overnight.
  Write task specs, go to sleep, wake up to real commits on production codebases.
  Docker containment, git worktree isolation, and a morning review workflow keep
  your main branch safe.
  Section 3: Quick Start
  ```bash
  npm install -g noxdev
  noxdev doctor                           # check prerequisites
  noxdev init my-project --repo ~/my-repo # register a project
  # write tasks in ~/worktrees/my-project/TASKS.md
  noxdev run my-project                   # run task loop
  noxdev status my-project                # morning summary
  noxdev merge my-project                 # approve/reject commits
  noxdev dashboard                        # visual review UI
  ```
  Section 4: Task Format
  Show the TASKS.md format with one example task. Explain each field briefly:
  STATUS, FILES, VERIFY, CRITIC, PUSH, SPEC. Show the three-tier push model
  (auto/gate/manual) in a small table.
  Section 5: Architecture
  A mermaid diagram showing the flow:
  TASKS.md → noxdev CLI → Docker container (Claude Code agent) → git commit →
  morning review (CLI or dashboard) → merge to main.
  Show the safety layers: Docker containment, worktree isolation, critic agent,
  gated push, no auto-push ever.
  Section 6: CLI Commands
  A table of all commands with one-line descriptions (same as design doc section 4).
  Section 7: The Morning Dashboard
  Brief description + mention to run noxdev dashboard. Note it runs on localhost only.
  Section 8: Safety Model
  Bullet list: Docker containment (memory/CPU/timeout), git worktree (main always safe),
  no auto-push ever, critic agent review, circuit breaker (3 failures → stop),
  SOPS + age secrets encryption.
  Section 9: Requirements
  Node.js >= 18, Docker, Git, Claude CLI (claude login), SOPS + age (optional, for secrets).
  Section 10: Built With
  One line: "Built by a single developer using AI-augmented development."
  Link to the Solo Dev Playbook (future).
  Section 11: License
  MIT. Link to LICENSE file.
  Keep the tone technical, understated, no marketing fluff. Write it for the
  Hacker News audience: they respect craft and distrust hype.

## T8: CHANGELOG.md for v0.1.0 launch
- STATUS: done
- FILES: CHANGELOG.md
- VERIFY: cat CHANGELOG.md | head -5
- CRITIC: skip
- PUSH: auto
- SPEC: Create CHANGELOG.md at the monorepo root following Keep a Changelog format.
  File: CHANGELOG.md
  ```markdown
  # Changelog

  All notable changes to noxdev will be documented in this file.
  Format based on [Keep a Changelog](https://keepachangelog.com/).

  ## [0.1.0] - 2026-03-XX

  ### Added
  - CLI commands: init, run, status, log, merge, projects, dashboard, doctor
  - Multi-project orchestration with sequential execution (--all flag)
  - Overnight unattended mode (--overnight flag)
  - SQLite ledger for full execution history
  - TASKS.md parser with multi-line SPEC support
  - Docker containment with memory/CPU/timeout limits
  - Git worktree isolation (main always safe)
  - Two-agent workflow: developer agent + optional critic agent
  - Max-first authentication (Claude Max free compute, API fallback)
  - Three-tier push model: auto, gate, manual
  - Circuit breaker: 3 consecutive failures pause project
  - Interactive merge workflow (approve/reject per commit)
  - React morning dashboard with diff viewer and merge review
  - Dark/light theme toggle in dashboard
  - noxdev doctor prerequisite checker
  - SOPS + age secrets encryption support
  - No auto-push, ever

  ### Bootstrap
  - noxdev built its own dashboard (Phase D) using the noxdev CLI
  - 43/43 autonomous tasks completed across 5 build phases
  ```
  Replace the date XX with the actual publish date before release.
