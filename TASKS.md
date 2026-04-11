# noxdev v1.0.5 — Polish & Ledger Consistency

# Dependencies: 1.0.4 published. Fullstack demo verified working on cold install.
# Gate between sessions: pnpm build && node packages/cli/dist/index.js doctor
#
# Session 1: T1, T2, T3 (ledger consistency — derive counts from task_results, sweep orphans)
# Session 2: T4 (doctor output split — prereqs vs managed state)
# Session 3: T5 (dashboard empty state)
# Session 4: T6, T7 (README hero screenshot + version bump + CHANGELOG)
#
# All tasks: CRITIC: skip, PUSH: auto (Eugene's standard dev mode).
# Critic + gated push validation is the topic of v1.0.6.

## T1: noxdev status — derive task counts from task_results, not runs row
- STATUS: done
- FILES: packages/cli/src/commands/status.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js status noxdev
- CRITIC: skip
- PUSH: auto
- SPEC: Real bug discovered through Ctrl+C abort testing on v1.0.4 run.
  The runs table has denormalized counter columns (completed, failed, skipped)
  that are only updated at run finalize time. When a run is aborted, these
  columns stay at 0 even though task_results rows show completed work.
  Fix: in packages/cli/src/commands/status.ts, find the section that prints
  the "Tasks: N completed, M failed, K skipped (of TOTAL)" summary line.
  Replace the read-from-runs-row logic with a derived query:

  ```typescript
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status IN ('COMPLETED', 'COMPLETED_RETRY') THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status NOT IN ('COMPLETED', 'COMPLETED_RETRY', 'FAILED') THEN 1 ELSE 0 END) as skipped
    FROM task_results
    WHERE run_id = ?
  `).get(run.id) as { completed: number; failed: number; skipped: number };
  ```

  Use counts.completed, counts.failed, counts.skipped for the summary line
  instead of run.completed, run.failed, run.skipped.
  The "(of TOTAL)" value should still come from the runs.total_tasks column
  (that one is set at run start and is correct).
  Do NOT modify the runs table schema. The denormalized columns can stay —
  we just stop trusting them in this command.

## T2: Sweep orphaned 'running' run rows to 'aborted' on noxdev run startup
- STATUS: done
- FILES: packages/cli/src/commands/run.ts
- VERIFY: cd packages/cli && pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: When noxdev is killed mid-run (Ctrl+C, crash, OOM), the runs row
  stays marked as status='running' forever. This pollutes status output
  and makes it impossible to tell what's actually in flight.
  Fix: in packages/cli/src/commands/run.ts, at the very top of the run
  command action (before parsing TASKS.md or starting any work), add a
  cleanup query that marks any stale running rows as aborted:

  ```typescript
  // Cleanup: any 'running' rows from previous sessions are orphans.
  // We're about to start a new run, so by definition no other run is in progress.
  db.prepare(`
    UPDATE runs
    SET status = 'aborted',
        finished_at = COALESCE(finished_at, datetime('now'))
    WHERE status = 'running'
  `).run();
  ```

  This is safe because noxdev run is single-threaded — there is no scenario
  where two noxdev run processes should be running simultaneously against
  the same ledger. If one is starting, any other 'running' row must be stale.
  Add a comment explaining the assumption. No user-facing output for this
  cleanup — silent operation.

## T3: noxdev status — show 'aborted' status for orphaned runs in history
- STATUS: done
- FILES: packages/cli/src/commands/status.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js status noxdev
- CRITIC: skip
- PUSH: auto
- SPEC: Companion to T2. After T2 marks orphans as 'aborted', the status
  command should display them clearly when listing recent runs.
  In packages/cli/src/commands/status.ts, find the run status rendering
  logic (where it prints "running", "completed", etc.). Add color coding:

  ```typescript
  function colorStatus(status: string): string {
    switch (status) {
      case 'completed': return chalk.green(status);
      case 'running':   return chalk.blue(status);
      case 'aborted':   return chalk.yellow(status);
      case 'failed':    return chalk.red(status);
      default:          return chalk.gray(status);
    }
  }
  ```

  Use colorStatus(run.status) wherever the run status string is printed.
  Do NOT change the data, just the rendering.

## T4: Split noxdev doctor output into 'Prerequisites' and 'Managed by noxdev'
- STATUS: done
- FILES: packages/cli/src/commands/doctor.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js doctor
- CRITIC: skip
- PUSH: auto
- SPEC: Real user feedback (Kissa's first install) showed doctor output
  was confusing because it mixed two different categories:
  - Things the user must install themselves (Docker, git, Node, pnpm, Claude Code)
  - Things noxdev creates and manages (~/.noxdev/ledger.db, Docker image, worktree dirs)
  Split the output into two clearly labeled sections.
  In packages/cli/src/commands/doctor.ts, find the existing checks array.
  Categorize each check into one of two groups by adding a 'category' field:

  ```typescript
  type CheckCategory = 'prerequisite' | 'managed';

  // When defining each check, tag it:
  checks.push(runCheck('Docker daemon running', 'prerequisite', () => { ... }));
  checks.push(runCheck('noxdev ledger.db', 'managed', () => { ... }));
  ```

  Update the runCheck signature to accept the category as the second arg.
  When printing results, group by category with section headers:

  ```
  Prerequisites (you must have these installed)
    ✓ Docker daemon running
    ✓ git 2.40.1
    ✓ Node 22.11.0
    ...

  Managed by noxdev (created on first run if missing)
    ✓ ~/.noxdev/ledger.db
    ✓ noxdev-runner:latest Docker image
    ...
  ```

  The pass/fail counters and exit code logic should not change — still
  treat both categories as required. Only the visual grouping changes.
  Existing 'informational' checks (Python, uv from v1.0.4) stay
  informational and render in a third "Informational" section.

## T5: Dashboard empty state when zero runs exist
- STATUS: done
- FILES: packages/dashboard/src/pages/Overview.tsx
- VERIFY: cd packages/dashboard && pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: When a new user opens the dashboard with zero runs in the database,
  they currently see a confusing blank Overview page. Add a friendly empty
  state that points them at the demo command.
  In packages/dashboard/src/pages/Overview.tsx, after fetching projects
  via useApi, check whether the projects array is empty OR all projects
  have zero runs. If so, render an empty state instead of the project grid:

  ```tsx
  if (!loading && (!projects || projects.length === 0 ||
      projects.every((p: any) => !p.last_run_id))) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="text-6xl mb-4">🦉</div>
        <h2 className="text-2xl font-semibold mb-2">Welcome to noxdev</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
          No runs yet. Run the fullstack demo to see noxdev in action —
          it builds a React + FastAPI app autonomously in under 5 minutes.
        </p>
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 font-mono text-sm">
          <div className="text-gray-400">$</div>
          <div>noxdev demo</div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">
          Already have a project? Run <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">noxdev init &lt;name&gt;</code> in your repo.
        </p>
      </div>
    );
  }
  ```

  Place this conditional return BEFORE the existing grid rendering logic.
  Do not modify the grid rendering — just add the early return.

## T6: README hero screenshot (manual placeholder + alt text)
- STATUS: done
- FILES: README.md, assets/demo/.gitkeep
- VERIFY: test -f README.md && grep -q "assets/demo" README.md
- CRITIC: skip
- PUSH: auto
- SPEC: Add an image reference for the fullstack demo hero screenshot.
  The actual PNG will be added manually by Eugene after capturing it from
  a clean v1.0.4 demo run — this task just adds the markdown reference
  and creates the directory structure.
  Step 1: Create packages/cli/assets/demo/.gitkeep (empty file) so the
  directory exists in git.
  Step 2: In README.md (the root README, not the cli package one), find
  the section right after the "Quickstart" heading. Add a centered image
  reference BEFORE the quickstart code block:

  ```markdown
  <p align="center">
    <img src="assets/demo/fullstack-demo.png" alt="noxdev fullstack demo: React + FastAPI built autonomously in under 5 minutes" width="720"/>
  </p>
  ```

  The PNG file itself does NOT need to exist for this task — Eugene will
  add it manually. The grep verify just checks that the markdown reference
  was added.
  Do not modify any other section of the README.

## T7: Version bump to 1.0.5 and CHANGELOG entry
- STATUS: done
- FILES: packages/cli/package.json, packages/cli/CHANGELOG.md
- VERIFY: cd packages/cli && pnpm build && node dist/index.js --version | grep "1.0.5"
- CRITIC: skip
- PUSH: auto
- SPEC: Bump version to 1.0.5 and add CHANGELOG entry.
  Step 1: In packages/cli/package.json, update the version field to "1.0.5".
  Step 2: In packages/cli/CHANGELOG.md, add at the top after the title and
  before the 1.0.4 entry:

  ```markdown
  ## [1.0.5] - 2026-04-12

  ### Added
  - Dashboard empty state for new installs (welcome screen pointing at `noxdev demo`)
  - `noxdev doctor` output now grouped into "Prerequisites" and "Managed by noxdev" sections for clarity
  - Hero screenshot reference in README (fullstack demo result)

  ### Fixed
  - `noxdev status` now derives task counts from task_results rather than the
    denormalized runs row, so aborted runs show correct completed/failed/skipped numbers
  - Orphaned 'running' run rows from interrupted sessions are now swept to
    'aborted' status on the next `noxdev run` startup
  - Run status now color-coded in `noxdev status` output (aborted shown in yellow)

  ### Notes
  - Critic agent + gated push validation is the focus of upcoming v1.0.6
  ```

  Do not publish to npm in this task — that's a manual step Eugene runs
  separately following the OSS release flow checklist.
