# Cost display restructure — projects → runs → tasks hierarchy

# Source audits (read into Project before planning the next round):
#   .audits/audit-cost-display-2026-04-15-v0.md
#   .audits/audit-cost-capture-postfix-2026-04-15.md
#
# Premise: v1.3.2 fixed cost CAPTURE. This TASKS.md fixes cost DISPLAY — the
# missing per-project and per-run views. After this work lands, the user can
# answer:
#   - Which projects are eating budget? (Overview cost stat per project card)
#   - What did this work session cost? (RunDetail rollup)
#   - Was any single task expensive? (drill-down via existing TaskDetail)
#   - Am I leaning too much on API vs Max? (split visible at every level)
#
# UX hierarchy after this work:
#   Overview              → all projects, totals, project cards with cost stat
#     Project view (NEW)  → project totals + runs table, click-through per run
#       Run Detail        → run rollup + task rows with cost column
#         Task Detail     → existing per-task cost section (unchanged)
#
# CRITICAL DATA-MODEL CONSTRAINT (encode in every relevant spec):
#   task_id values are NOT unique across runs. Every TASKS.md reuses T1, T2, ...
#   NEVER aggregate by task_id at project or global level. Always GROUP BY run_id,
#   then drill down to tasks within a single run.
#
# Dependencies: clean main at v1.3.2 published. Capture validated working
#   (one fresh run produces a row with non-null model and cost_usd > 0)
#   BEFORE merging any of this — otherwise the display is built on an
#   unverified foundation. The display CODE is independent of capture state,
#   but visual sanity checks during development require real data.
#
# Gate: pnpm build && pnpm test pass; noxdev dashboard renders Project view
#   with runs table; noxdev cost defaults to per-project breakdown.
#
# CRITIC: skip on all tasks. Verification done via post-run audit comparing
# actual diffs against this TASKS.md.

## T1: per-run cost query + /api/cost/runs/:runId endpoint
- STATUS: done
- FILES: packages/cli/src/db/queries.ts, packages/dashboard/src/api/routes/cost.ts
- VERIFY: cd packages/cli && pnpm build && cd ../dashboard && pnpm build && grep -q "getRunCostBreakdown\|getRunCost" packages/cli/dist/db/queries.js && grep -q "/runs/:runId\|/runs/:run_id" packages/dashboard/dist/api/server.js
- CRITIC: skip
- SPEC:
  Foundation for RunDetail cost rollup (T5) and consumed by Project view runs
  table (T6).

  Step 1 — In packages/cli/src/db/queries.ts, add a query function:
  getRunCostBreakdown(db, runId) returning a single row:
  {
    run_id: string,
    total_tasks: number,
    tasks_with_cost: number,           // count where model IS NOT NULL
    input_tokens: number,
    output_tokens: number,
    cache_read_tokens: number,
    cache_write_tokens: number,
    api_tasks: number,                 // count where auth_mode_cost = 'api'
    api_cost_usd: number,
    max_tasks: number,                 // count where auth_mode_cost = 'max'
    max_cost_usd_equivalent: number
  }

  Query pattern (match existing style in cost.ts:83-100):
  ```sql
  SELECT
    r.id as run_id,
    COUNT(*) as total_tasks,
    SUM(CASE WHEN tr.model IS NOT NULL THEN 1 ELSE 0 END) as tasks_with_cost,
    COALESCE(SUM(tr.input_tokens), 0) as input_tokens,
    COALESCE(SUM(tr.output_tokens), 0) as output_tokens,
    COALESCE(SUM(tr.cache_read_tokens), 0) as cache_read_tokens,
    COALESCE(SUM(tr.cache_write_tokens), 0) as cache_write_tokens,
    SUM(CASE WHEN tr.auth_mode_cost = 'api' THEN 1 ELSE 0 END) as api_tasks,
    COALESCE(SUM(CASE WHEN tr.auth_mode_cost = 'api' THEN tr.cost_usd ELSE 0 END), 0) as api_cost_usd,
    SUM(CASE WHEN tr.auth_mode_cost = 'max' THEN 1 ELSE 0 END) as max_tasks,
    COALESCE(SUM(CASE WHEN tr.auth_mode_cost = 'max' THEN tr.cost_usd ELSE 0 END), 0) as max_cost_usd_equivalent
  FROM task_results tr
  JOIN runs r ON tr.run_id = r.id
  WHERE r.id = ?
  GROUP BY r.id
  ```

  Note: NO `AND model IS NOT NULL` filter at the top level — we want to count
  all tasks in the run (including those without cost data) so the "tasks with
  cost / total tasks" ratio is visible.

  Step 2 — In packages/dashboard/src/api/routes/cost.ts add endpoint:
  GET /api/cost/runs/:runId
  Returns the single object from getRunCostBreakdown.
  404 if run not found.

  Match existing route patterns in the same file. Use the same try/catch +
  500 error handling.

  Do NOT modify cost.ts CLI command (separate task).
  Do NOT modify any existing query.

## T2: per-project detail endpoint + per-run rows
- STATUS: done
- FILES: packages/dashboard/src/api/routes/cost.ts
- VERIFY: cd packages/dashboard && pnpm build && grep -q "/projects/:projectId\|/projects/:project_id" packages/dashboard/dist/api/server.js && grep -q "runs" packages/dashboard/dist/api/server.js
- CRITIC: skip
- SPEC:
  Backend for the new ProjectView page (T6).

  In packages/dashboard/src/api/routes/cost.ts add:
  GET /api/cost/projects/:projectId

  Returns:
  {
    project: { id, display_name, repo_path },
    totals: {
      total_runs: number,
      total_tasks: number,
      tasks_with_cost: number,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      api_tasks, api_cost_usd,
      max_tasks, max_cost_usd_equivalent
    },
    runs: [
      {
        run_id: string,
        started_at: string,
        finished_at: string | null,
        duration_seconds: number | null,
        auth_mode: string,
        status: string,
        total_tasks: number,
        tasks_with_cost: number,
        api_cost_usd: number,
        max_cost_usd_equivalent: number,
        total_cost_usd: number  // api + max
      },
      ...
    ]
  }

  runs array sorted by started_at DESC (newest first).
  404 if project not found.

  Implementation: two queries.

  Query 1 — project totals (one row):
  ```sql
  SELECT
    p.id, p.display_name, p.repo_path,
    COUNT(DISTINCT r.id) as total_runs,
    COUNT(tr.id) as total_tasks,
    SUM(CASE WHEN tr.model IS NOT NULL THEN 1 ELSE 0 END) as tasks_with_cost,
    COALESCE(SUM(tr.input_tokens), 0) as input_tokens,
    COALESCE(SUM(tr.output_tokens), 0) as output_tokens,
    COALESCE(SUM(tr.cache_read_tokens), 0) as cache_read_tokens,
    COALESCE(SUM(tr.cache_write_tokens), 0) as cache_write_tokens,
    SUM(CASE WHEN tr.auth_mode_cost = 'api' THEN 1 ELSE 0 END) as api_tasks,
    COALESCE(SUM(CASE WHEN tr.auth_mode_cost = 'api' THEN tr.cost_usd ELSE 0 END), 0) as api_cost_usd,
    SUM(CASE WHEN tr.auth_mode_cost = 'max' THEN 1 ELSE 0 END) as max_tasks,
    COALESCE(SUM(CASE WHEN tr.auth_mode_cost = 'max' THEN tr.cost_usd ELSE 0 END), 0) as max_cost_usd_equivalent
  FROM projects p
  LEFT JOIN runs r ON r.project_id = p.id
  LEFT JOIN task_results tr ON tr.run_id = r.id
  WHERE p.id = ?
  GROUP BY p.id, p.display_name, p.repo_path
  ```

  Query 2 — per-run rows (multi-row, GROUP BY run):
  ```sql
  SELECT
    r.id as run_id,
    r.started_at, r.finished_at, r.duration_seconds,
    r.auth_mode, r.status,
    COUNT(tr.id) as total_tasks,
    SUM(CASE WHEN tr.model IS NOT NULL THEN 1 ELSE 0 END) as tasks_with_cost,
    COALESCE(SUM(CASE WHEN tr.auth_mode_cost = 'api' THEN tr.cost_usd ELSE 0 END), 0) as api_cost_usd,
    COALESCE(SUM(CASE WHEN tr.auth_mode_cost = 'max' THEN tr.cost_usd ELSE 0 END), 0) as max_cost_usd_equivalent,
    COALESCE(SUM(tr.cost_usd), 0) as total_cost_usd
  FROM runs r
  LEFT JOIN task_results tr ON tr.run_id = r.id
  WHERE r.project_id = ?
  GROUP BY r.id, r.started_at, r.finished_at, r.duration_seconds, r.auth_mode, r.status
  ORDER BY r.started_at DESC
  ```

  IMPORTANT: GROUP BY run_id (not task_id). Task IDs are reused across runs
  and are not unique at project level — aggregating by task_id would silently
  collapse different tasks together.

  Match existing route patterns in the same file. Use the same try/catch.

  Do NOT modify other routes.

## T3: Overview project cards — add cost stat per project
- STATUS: done
- FILES: packages/dashboard/src/api/routes/projects.ts, packages/dashboard/src/components/RunCard.tsx
- VERIFY: cd packages/dashboard && pnpm build && grep -q "cost_usd\|total_cost" packages/dashboard/dist/api/server.js && grep -q "cost\|Cost" packages/dashboard/dist/assets/*.js
- CRITIC: skip
- SPEC:
  Each project card on the Overview page should show a small cost stat so the
  user can see at a glance which projects are accumulating cost.

  Step 1 — In packages/dashboard/src/api/routes/projects.ts (the existing
  endpoint that powers Overview project cards), add cost fields to the
  returned per-project object:
    total_cost_usd: number      // api + max equivalent across all this project's runs
    total_runs: number          // count of runs for this project

  Modify the existing query to LEFT JOIN task_results and SUM cost_usd,
  COUNT(DISTINCT runs.id). Do not break existing fields.

  Step 2 — In packages/dashboard/src/components/RunCard.tsx (the project
  card component used on Overview), add a small line near the bottom of the
  card showing:
    "$X.XX • N runs"  (where $X.XX is total_cost_usd, N is total_runs)

  If total_cost_usd is 0 AND there are runs, show:
    "no cost data • N runs"  (distinguish from "$0.00 • N runs")

  If there are zero runs, show nothing additional (the existing "No runs
  yet" placeholder stays).

  Use the same Tailwind class vocabulary as the rest of the card. Make this
  the smallest text style on the card — it's a glanceable stat, not a
  headline.

  Do NOT modify the rest of RunCard. Do NOT modify Overview.tsx beyond what
  prop type changes require.

## T4: Implement ProjectView page + add /projects/:id route
- STATUS: done
- FILES: packages/dashboard/src/pages/ProjectView.tsx, packages/dashboard/src/App.tsx
- VERIFY: cd packages/dashboard && pnpm build && grep -q "ProjectView\|projectId" packages/dashboard/dist/assets/*.js && grep -q "/projects/" packages/dashboard/dist/assets/*.js
- CRITIC: skip
- SPEC:
  Replace the placeholder ProjectView with a real page showing project totals
  and a runs table. This is the headline UX of this release.

  Step 1 — In packages/dashboard/src/App.tsx add a route:
    /projects/:projectId  →  <ProjectView />

  Add it next to the existing routes. Pattern matches the existing
  /runs/:runId route.

  Step 2 — In packages/dashboard/src/pages/ProjectView.tsx replace the
  placeholder content. Use useParams() to get projectId. Use useApi() (the
  existing hook) to fetch GET /api/cost/projects/:projectId.

  Layout (top to bottom):

  Header:
    - Back link: "← Back to Overview"
    - h1: project display_name
    - Subtitle: repo_path in muted/mono text
    - Status row: total_runs, total_tasks ("N tasks across M runs")

  Project totals card (use same visual language as CostSummary on Overview):
    Three cards in a row:
      "API Cost" (green)        — $X.XX, "N tasks" subtitle
      "Max Equivalent" (orange) — $X.XX, "N tasks" subtitle
      "Total Tokens" (blue)     — compact M/K, "N tasks with cost data" subtitle

    If totals.tasks_with_cost === 0 AND totals.total_tasks > 0, show a banner
    above the cards:
      "No cost data captured yet — runs from before v1.3.2 do not have token data."

  Runs table (the new core view):
    Columns: Date | Run ID | Tasks | Duration | API $ | Max $ (equiv) | Total
    Each row clickable, navigates to /runs/:runId
    Sort: started_at DESC by default
    Status badge inline with the run ID (use existing StatusBadge component)
    Format date/time consistently with RunDetail page
    Format tasks as "M/N" where M = tasks_with_cost, N = total_tasks
      (so user can see at a glance "8/8" = full coverage, "0/12" = no data)
    Format costs: use the unified formatCost (T8) — 2 decimals here

  Empty states:
    - Zero runs: "No runs yet for this project. Run: noxdev run <project>"
    - Project not found (404 from API): "Project not found. ← Back to Overview"

  Use the same Tailwind/shadcn-style vocabulary as Overview and RunDetail.
  Match the existing site visual language exactly — do not invent new
  components when existing ones (StatusBadge, card patterns) work.

  Do NOT add expand-to-show-tasks UX for this release — clicking a run row
  navigates to RunDetail which has the per-task breakdown (T5). Simpler scope.

## T5: RunDetail — add cost rollup header + cost column on task rows
- STATUS: done
- FILES: packages/dashboard/src/pages/RunDetail.tsx, packages/dashboard/src/components/TaskRow.tsx
- VERIFY: cd packages/dashboard && pnpm build && grep -q "cost\|Cost" packages/dashboard/dist/assets/*.js
- CRITIC: skip
- SPEC:
  RunDetail currently has zero cost references (per audit). Add:

  Step 1 — In packages/dashboard/src/pages/RunDetail.tsx, fetch cost data for
  this run alongside the existing task data:
    useApi('/api/cost/runs/' + runId)  → returns getRunCostBreakdown shape (see T1)

  Step 2 — Add a cost rollup section to the run header, between the existing
  metadata (started/finished/auth mode) and the task list. Three-card layout
  matching CostSummary visual style:
    "API Cost" (green)        — $X.XX from api_cost_usd, "N tasks" subtitle
    "Max Equivalent" (orange) — $X.XX from max_cost_usd_equivalent, "N tasks"
    "Total Tokens" (blue)     — compact M/K of input + output

  If tasks_with_cost === 0 AND total_tasks > 0, replace the cards with a
  single muted banner:
    "No cost data captured for this run."

  Step 3 — TaskRow already has cost rendering (audit confirms TaskRow.tsx:108
  renders formatCost). Verify it still renders correctly with real data after
  T8's formatCost unification — no functional changes needed here unless
  T8 changes the import path.

  Do NOT modify the existing task list / status badge / progress bar.
  Do NOT change task expand/collapse behavior.

## T6: Restructure noxdev cost CLI
- STATUS: done
- FILES: packages/cli/src/commands/cost.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "per-project\|projects" packages/cli/dist/commands/cost.js && grep -q "\\-\\-run\|run_id" packages/cli/dist/commands/cost.js
- CRITIC: skip
- SPEC:
  Current behavior:
    noxdev cost           → global totals (one summary)
    noxdev cost <project> → single-project totals (one summary)
    noxdev cost --all     → per-project breakdown table

  Desired behavior (mirrors dashboard hierarchy):
    noxdev cost                   → per-project breakdown table (current --all)
    noxdev cost <project>         → per-run breakdown table for that project
    noxdev cost --run <run-id>    → per-task breakdown for that run
    noxdev cost --all             → still works (alias for default behavior — backwards compat)
    noxdev cost --global          → NEW: explicit global totals (old default)

  Why: the previous default (global totals) answered the least useful question
  and required --all to get the actually-useful per-project view. Per-project
  is the natural default.

  Step 1 — Add new query function getPerRunCostData(db, projectId, sinceDate)
  matching the shape of T2's runs array (returns per-run rows for one project).
  If projectId is null, no rows. (--run uses T1's getRunCostBreakdown via a
  different code path — single run, not project-scoped.)

  Step 2 — Add per-run table renderer:
    Header: "RUN ID                 STARTED    TASKS    DURATION    $API     $MAX-EQ   $TOTAL"
    Each row: run_id, formatted started_at (date + time), tasks "M/N",
    duration formatted, costs.
    Total footer row.

  Step 3 — Add per-task table renderer for --run:
    Header: "TASK    STATUS    DURATION    MODEL                 TOKENS         $COST"
    Each row: task_id, status, duration, truncated model name, total tokens,
    cost_usd.
    Total footer row.

  Step 4 — Restructure the command flow:
    - Default (no project, no --run, no --global, no --all): per-project table
    - With <project> arg, no --run: per-run table for that project
    - With --run <id>: per-task table for that run, ignore project arg
    - With --global: old global-totals view (the current no-args output)
    - With --all: same as default (per-project table)

  Step 5 — All renderers must use the unified formatCost from T8 (consistent
  precision across CLI commands).

  Step 6 — Null handling: when tasks_with_cost === 0 but total_tasks > 0,
  show a one-line note above the table:
    "Note: N tasks have no cost data captured (broken capture pre-v1.3.2 or
     model field is null)."
  Keep the existing "No cost data found" message for genuinely empty result
  sets.

  CRITICAL: Per-project and per-run aggregations must GROUP BY project_id or
  run_id respectively. NEVER aggregate by task_id at any level above
  per-task — task IDs are reused across runs and TASKS.md files. Aggregating
  by task_id would silently collapse different tasks.

  Preserve --since flag behavior on all variants. Preserve existing
  formatNumber helper. Existing types CostRow / TotalCostRow stay; add new
  PerRunCostRow and PerTaskCostRow types as needed.

  Do NOT remove the existing query functions even if some become unused —
  some are still called by status.ts.

## T7: Unify formatCost across CLI and dashboard
- STATUS: pending
- FILES: packages/cli/src/lib/format.ts, packages/cli/src/commands/cost.ts, packages/cli/src/commands/status.ts, packages/cli/src/commands/log.ts, packages/dashboard/src/lib/format.ts, packages/dashboard/src/components/TaskRow.tsx, packages/dashboard/src/components/CostSummary.tsx, packages/dashboard/src/pages/TaskDetail.tsx
- VERIFY: cd packages/cli && pnpm build && cd ../dashboard && pnpm build && grep -c "function formatCost" packages/cli/src/commands/cost.ts packages/cli/src/commands/status.ts packages/cli/src/commands/log.ts | grep -v ":0" | wc -l | grep -q "^0$"
- CRITIC: skip
- SPEC:
  Three different formatCost implementations exist with different precisions
  (audit RISK 9):
    cost.ts:    2 decimals → $1.40
    status.ts:  2 decimals → $1.40
    log.ts:     4 decimals → $1.4000
    TaskRow.tsx: 3 decimals → $1.400 / $1.400*
    TaskDetail.tsx (formatCostDisplay): 4 decimals → $1.4000 (api)
    CostSummary.tsx: inline Intl.NumberFormat, 2-4 decimals

  Same number, six different presentations. Confusing.

  Standard going forward (one rule):
    Aggregate views (totals, summaries, per-project, per-run): 2 decimals → $1.40
    Per-task drilldown views: 4 decimals → $1.4000 (precision matters when costs are tiny)

  Step 1 — Create packages/cli/src/lib/format.ts:
  ```ts
  export function formatCost(cost: number | null | undefined, mode: 'aggregate' | 'detail' = 'aggregate'): string {
    if (cost == null) return '—';
    if (cost === 0) return mode === 'detail' ? '$0.0000' : '$0.00';
    const decimals = mode === 'detail' ? 4 : 2;
    return `$${cost.toFixed(decimals)}`;
  }

  export function formatTokens(n: number | null | undefined): string {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  export function formatTokensFull(n: number | null | undefined): string {
    if (n == null) return '—';
    return new Intl.NumberFormat('en-US').format(n);
  }
  ```

  Step 2 — Create packages/dashboard/src/lib/format.ts with the SAME
  exported functions (mirror — dashboard cannot import from packages/cli).
  Keep them identical character-for-character so behavior matches.

  Step 3 — Replace local formatCost / formatNumber / formatTokens
  implementations in:
    packages/cli/src/commands/cost.ts
    packages/cli/src/commands/status.ts
    packages/cli/src/commands/log.ts (use 'detail' mode)
    packages/dashboard/src/components/TaskRow.tsx
    packages/dashboard/src/components/CostSummary.tsx (use 'aggregate' mode)
    packages/dashboard/src/pages/TaskDetail.tsx (use 'detail' mode)
  Import the shared helper instead. Delete the local implementations.

  Step 4 — TaskRow's auth-mode suffix ('*' for max with tooltip) is NOT part
  of formatCost — it's the caller's job. Keep that logic local to TaskRow.

  Do NOT change the auth-mode suffix conventions ((api), equivalent (max),
  the asterisk pattern). Only the numeric format gets unified.

## T8: Display totalCost in CostSummary, fix dead worktreePath param
- STATUS: pending
- FILES: packages/dashboard/src/components/CostSummary.tsx, packages/cli/src/cost/parser.ts, packages/cli/src/engine/orchestrator.ts
- VERIFY: cd packages/cli && pnpm build && cd ../dashboard && pnpm build && grep -q "totalCost\|total" packages/dashboard/dist/assets/*.js && ! grep -q "worktreePath" packages/cli/dist/cost/parser.js
- CRITIC: skip
- SPEC:
  Two unrelated cleanups surfaced by the audits, bundled because each is
  trivial alone.

  Cleanup 1 — CostSummary computed totalCost (audit display RISK 10):
  CostSummary.tsx:54 computes:
    const totalCost = summary.api.cost_usd + summary.max.cost_usd_equivalent;
  but never renders it. The user sees API cost and Max equivalent cost as
  two separate numbers with no total — they have to add in their head.

  Add a 4th element to the layout (or expand the 3-card grid to show a total
  beneath). Render as the unified formatCost (aggregate mode → 2 decimals).
  Label it "Total" with subtitle "API + Max equivalent".

  Cleanup 2 — captureTaskCost dead parameter (audit capture postfix):
  packages/cli/src/engine/orchestrator.ts captureTaskCost signature is:
    captureTaskCost(worktreePath, containerStartMs, authMode)
  But after T5 of v1.3.2, worktreePath is never used inside the function —
  findLatestSessionFile no longer takes it. The parameter is dead.

  Remove worktreePath from the captureTaskCost signature. Update the call
  site (orchestrator.ts itself, around the existing capture invocation) to
  not pass it.

  Verify the worktree path is not used for anything else in captureTaskCost
  before removing — if it has another use, leave it. (The audit confirms it
  has no other use, but verify by reading the function before changing.)

  Do NOT modify findLatestSessionFile (that's already correct).

## T9: README — update cost section to match new structure
- STATUS: pending
- FILES: README.md
- VERIFY: grep -q "noxdev cost" README.md && grep -q "per-project\|projects" README.md
- CRITIC: skip
- SPEC:
  The README cost section (lines 113-150 per audit) shows aspirational
  example output for `noxdev cost --all` that:
    (a) uses the OLD command structure
    (b) has never matched real output (capture was broken pre-v1.3.2)

  Update the README cost section to:
    1. Document the new command hierarchy:
       - noxdev cost              (per-project breakdown — default)
       - noxdev cost <project>    (per-run breakdown for one project)
       - noxdev cost --run <id>   (per-task breakdown for one run)
       - noxdev cost --global     (global totals across all projects)
    2. Replace the example output blocks with realistic examples reflecting
       the new structure. If no real output is available yet, use synthetic
       but plausible numbers (clearly mark as illustrative).
    3. Note that cost data is captured per-task starting from v1.3.2 — older
       runs will appear with no cost data. This is expected.
    4. Document the dashboard equivalents:
       - Overview cards show project totals
       - Click into a project for runs table
       - Click into a run for per-task breakdown

  Do NOT modify other README sections.
  Do NOT modify CHANGELOG (cleanups in this round are not user-facing
  enough to warrant a release note — handle in next version bump).
