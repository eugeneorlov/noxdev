# Cost display Round B — A.1 fixes folded in + project-page redesign with flat task table

# Audits:
#   .audits/audit-cost-display-v2-2026-04-15.md (pre-Round-A)
#   .audits/audit-cost-display-round-a-after-2026-04-15.md (post-Round-A — what shipped wrong)
# Round A.1 fixes (T1-T3) MUST land before Round B redesign tasks (T4-T9) to avoid
# building the redesign on the broken formatCost foundation.

## T1: Rewrite both lib/format.ts files to spec — identical mirrors with mode parameter
- STATUS: pending
- FILES: packages/cli/src/lib/format.ts, packages/dashboard/src/lib/format.ts, packages/cli/src/commands/cost.ts, packages/cli/src/commands/status.ts, packages/cli/src/commands/log.ts, packages/dashboard/src/components/TaskRow.tsx, packages/dashboard/src/components/CostSummary.tsx, packages/dashboard/src/pages/TaskDetail.tsx, packages/dashboard/src/pages/RunDetail.tsx, packages/dashboard/src/components/RunCard.tsx
- VERIFY: cd packages/cli && pnpm build && cd ../dashboard && pnpm build && diff packages/cli/src/lib/format.ts packages/dashboard/src/lib/format.ts && grep -q "mode: 'aggregate' | 'detail'" packages/cli/src/lib/format.ts && grep -q "mode: 'aggregate' | 'detail'" packages/dashboard/src/lib/format.ts && ! grep -rE "'basic'|'display'|'props'|'currency'" packages/dashboard/src/lib/format.ts packages/dashboard/src/components/ packages/dashboard/src/pages/ && node -e "const {formatCost} = require('./packages/cli/dist/lib/format.js'); if (formatCost(1.5, 'aggregate') !== '\$1.50') process.exit(1); if (formatCost(1.5, 'detail') !== '\$1.5000') process.exit(1); if (formatCost(null) !== '—') process.exit(1);"
- CRITIC: skip
- SPEC: Round A's T2 shipped a 4-mode multi-return-type API instead of the spec's
  2-mode string-only API. Two lib/format.ts files are NOT mirrors. TaskRow and
  RunCard show 3-decimal precision instead of 2. See audit-cost-display-round-a-
  after section "T2 spec drift catalog".

  This task redoes T2 properly. The VERIFY gate has THREE positive assertions
  the previous round lacked:
  1. `diff` between the two format.ts files (must exit 0 — files identical)
  2. positive grep for `mode: 'aggregate' | 'detail'` signature in both files
  3. behavioral assertion via `node -e` that formatCost actually produces
     correct output for aggregate mode, detail mode, and null input

  Step 1 — Replace packages/cli/src/lib/format.ts entire contents with EXACTLY:
  ```
  export function formatCost(
    cost: number | null | undefined,
    mode: 'aggregate' | 'detail' = 'aggregate'
  ): string {
    if (cost == null) return '—';
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

  Step 2 — Replace packages/dashboard/src/lib/format.ts entire contents with
  THE SAME CHARACTER-FOR-CHARACTER text. Delete every other export from this
  file. Delete the 'props' mode that returns CSS classes — that mixing of
  formatting with presentation belongs in the consumer (TaskRow), not the
  formatter.

  Step 3 — Update every consumer to use the new 2-mode API:
  - cost.ts → formatCost(value, 'aggregate')
  - status.ts → formatCost(value, 'aggregate')
  - log.ts → formatCost(value, 'detail')
  - TaskRow.tsx → formatCost(value, 'aggregate'). The asterisk-with-tooltip
    suffix for max-mode now lives ENTIRELY in TaskRow component code (read
    auth_mode, conditionally render the asterisk and tooltip). formatCost
    only returns the dollar string.
  - CostSummary.tsx → formatCost(value, 'aggregate')
  - TaskDetail.tsx → formatCost(value, 'detail'). The "(api)" / "equivalent
    (max)" suffix logic stays local to TaskDetail.
  - RunDetail.tsx → formatCost(value, 'aggregate')
  - RunCard.tsx → formatCost(value, 'aggregate')

  Step 4 — Verify zero references to the old 4-mode strings remain anywhere
  in dashboard (the negative grep in VERIFY enforces this).

  Do NOT add any other exports to format.ts. Do NOT add options object,
  precision parameter, or class-name returns. The two files must be byte-
  identical mirrors.

## T2: Restructure CostSummary and RunDetail — collapse to 2 cards each + footnotes
- STATUS: pending
- FILES: packages/dashboard/src/components/CostSummary.tsx, packages/dashboard/src/pages/RunDetail.tsx, packages/dashboard/src/lib/format.ts
- VERIFY: cd packages/dashboard && pnpm build && grep -c "<Card" packages/dashboard/src/components/CostSummary.tsx | head -1 | grep -qE "^[12]$" && grep -q "Token-based cost. Max-mode tasks show equivalent API cost." packages/dashboard/src/components/CostSummary.tsx && grep -q "Token-based cost. Max-mode tasks show equivalent API cost." packages/dashboard/src/pages/RunDetail.tsx && grep -q "Input + output. Cache tokens shown in task detail." packages/dashboard/src/components/CostSummary.tsx && grep -q "Input + output. Cache tokens shown in task detail." packages/dashboard/src/pages/RunDetail.tsx && ! grep -q "Max equivalent API cost" packages/dashboard/src/lib/format.ts && grep -qE "grid-cols-2" packages/dashboard/src/components/CostSummary.tsx
- CRITIC: skip
- SPEC: Round A's T4 renamed labels but did NOT restructure cards. CostSummary
  still has 4 cards (2 saying "Cost" with different values — worse UX than
  before the rename). RunDetail still has 3 cards. See audit section "T4 spec
  drift catalog".

  This task does the structural change Round A skipped.

  Spec requirement: AGGREGATE views show ONE Cost card (combined api_cost_usd
  + max_cost_usd_equivalent) and ONE Tokens card. That's it. Two cards total.

  The asterisk-suffix pattern with footnote is how we honestly communicate
  the auth-mode caveat without requiring two cards.

  Footnote (use this EXACT wording everywhere):
  `* Token-based cost. Max-mode tasks show equivalent API cost.`

  Tokens footnote (use this EXACT wording everywhere):
  `* Input + output. Cache tokens shown in task detail.`

  Step 1 — In packages/dashboard/src/components/CostSummary.tsx delete the 4
  cards (api_cost_usd card, max_cost_usd_equivalent card, totalCost card,
  tokens card) and replace with EXACTLY 2:
  - Card 1: label "Cost*", value = formatCost(api_cost_usd + max_cost_usd_equivalent, 'aggregate')
    Below the value, in muted small text: `* Token-based cost. Max-mode tasks show equivalent API cost.`
  - Card 2: label "Tokens*", value = formatTokens(input + output)
    Below the value, in muted small text: `* Input + output. Cache tokens shown in task detail.`

  Layout: change `grid-cols-4` to `grid-cols-2`.

  Step 2 — In packages/dashboard/src/pages/RunDetail.tsx delete the 3 cards
  (api card, max card, tokens card) and replace with EXACTLY 2 cards using
  the same structure as CostSummary. Use formatCost from lib/format.ts (T1
  must land first). Same two footnotes.

  Step 3 — In packages/dashboard/src/lib/format.ts (after T1's mirror rewrite),
  if `"Max equivalent API cost"` string still exists anywhere, delete it. The
  footnote in the visible UI is the canonical source; tooltips don't need
  this string anymore because the auth-mode-aware suffix lives in TaskRow.

  CRITICAL: The VERIFY gate counts `<Card` occurrences in CostSummary.tsx —
  must be 1 or 2 (regex `^[12]$`). 3+ cards fails the gate. Plus positive
  greps for both footnote strings in both files plus a `grid-cols-2` check.
  These are the assertions Round A was missing.

  Do NOT keep the old 4-card layout "for backwards compat". This is a
  hobby project, no users to break. Make the cut clean.

## T3: Add structural index for project-scoped queries
- STATUS: pending
- FILES: packages/cli/src/db/migrate.ts, packages/cli/src/db/schema.sql
- VERIFY: cd packages/cli && pnpm build && grep -q "idx_runs_project" packages/cli/src/db/schema.sql && grep -q "idx_runs_project" packages/cli/src/db/migrate.ts
- CRITIC: skip
- SPEC: The new flat task-execution endpoint (T5) joins task_results → runs →
  projects with WHERE project_id filter. There is no index on runs(project_id)
  per the v2 audit. A single project will accumulate many runs over time;
  scanning all runs for each query is O(n) where n grows monotonically.

  Add the index. Cheap insurance.

  Step 1 — In packages/cli/src/db/schema.sql add after the runs table
  definition:
  `CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);`

  Step 2 — In packages/cli/src/db/migrate.ts find the migrations list. Add
  a migration that runs the same CREATE INDEX statement so existing
  installations get the index without recreating the database.

  Use IF NOT EXISTS in both places — idempotent. Re-running migrations
  on a database that already has the index is a no-op.

  Do NOT add other indexes. Do NOT touch other tables.

## T4: New endpoint GET /api/projects/:projectId/tasks for flat task list
- STATUS: pending
- FILES: packages/dashboard/src/api/routes/projects.ts, packages/cli/src/db/queries.ts
- VERIFY: cd packages/cli && pnpm build && cd ../dashboard && pnpm build && grep -q "/tasks" packages/dashboard/dist/api/server.js && grep -q "getProjectTaskExecutions" packages/cli/dist/db/queries.js
- CRITIC: skip
- SPEC: New endpoint returns every task execution for one project as a flat
  list. Each row is one task in one run. Powers the new ProjectView flat
  table (T6).

  CRITICAL DATA-MODEL CONSTRAINT (encode in this SPEC because it's not
  visible from the parser elsewhere): task_id values are NOT unique across
  runs. Every TASKS.md reuses T1, T2, ... NEVER aggregate by task_id at
  project level. Each row in the flat table is `(run_id, task_id)` — these
  together identify a unique task execution.

  Step 1 — Add a new query in packages/cli/src/db/queries.ts:
  `getProjectTaskExecutions(db, projectId, sortBy, sortDir)` returning rows:
  ```
  {
    run_id: string,
    run_started_at: string,
    task_id: string,
    title: string,
    status: string,
    duration_seconds: number | null,
    model: string | null,
    auth_mode_cost: string | null,
    cost_usd: number,
    input_tokens: number,
    output_tokens: number,
    commit_sha: string | null,
    attempt: number
  }
  ```

  Query (works on existing schema, no new joins required beyond what's
  documented in the v2 audit Section 3):
  ```sql
  SELECT
    r.id as run_id,
    r.started_at as run_started_at,
    tr.task_id,
    tr.title,
    tr.status,
    tr.duration_seconds,
    tr.model,
    tr.auth_mode_cost,
    COALESCE(tr.cost_usd, 0) as cost_usd,
    COALESCE(tr.input_tokens, 0) as input_tokens,
    COALESCE(tr.output_tokens, 0) as output_tokens,
    tr.commit_sha,
    tr.attempt
  FROM task_results tr
  JOIN runs r ON tr.run_id = r.id
  WHERE r.project_id = ?
  ORDER BY <sortBy> <sortDir>
  ```

  Validate sortBy against allowlist: ['cost_usd', 'run_started_at',
  'duration_seconds', 'task_id']. Reject any other value (SQL injection
  defense). Default sortBy = 'run_started_at', default sortDir = 'DESC'.

  Validate sortDir against ['ASC', 'DESC']. Default 'DESC'.

  Step 2 — Add route in packages/dashboard/src/api/routes/projects.ts:
  GET /api/projects/:projectId/tasks?sort=<col>&dir=<asc|desc>

  Returns:
  ```
  {
    project_id: string,
    sort: { by: string, dir: 'asc' | 'desc' },
    tasks: [...] // flat array from getProjectTaskExecutions
  }
  ```

  404 if project not found. 400 if sort param is not in allowlist (return
  the allowed list in the error message).

  Match existing route patterns. Use the same try/catch + 500 error handling
  as other routes in this file.

  Do NOT modify other routes. Do NOT change /api/cost/projects/:projectId
  (the per-run-aggregates route stays — both will be needed eventually,
  even if Round B doesn't use the runs aggregate route directly).

## T5: New ProjectView — totals header + flat sortable task table (drop runs table)
- STATUS: pending
- FILES: packages/dashboard/src/pages/ProjectView.tsx
- VERIFY: cd packages/dashboard && pnpm build && grep -q "/api/projects/.*tasks" packages/dashboard/src/pages/ProjectView.tsx && ! grep -q "Runs" packages/dashboard/src/pages/ProjectView.tsx && grep -qE "sort.*cost|sort.*date|sortBy" packages/dashboard/src/pages/ProjectView.tsx
- CRITIC: skip
- SPEC: Replace the current ProjectView (which shows project name + runs
  list per audit T4 finding — no aggregate cards, just runs) with the
  new design.

  This page answers: "what did this project cost overall, and which
  individual task executions were the most expensive?"

  No runs table. The flat task table groups by run when sorted by
  run_started_at, but is the only data presentation.

  Layout (top to bottom):

  1. Header: back link "← Back to Overview", h1 with project display_name,
     muted subtitle with repo_path.

  2. Aggregate cards (use same 2-card pattern as T2's CostSummary):
     - Card 1: "Cost*" — sum of all task cost_usd across all runs of this
       project. Footnote: `* Token-based cost. Max-mode tasks show equivalent API cost.`
     - Card 2: "Tokens*" — sum of input_tokens + output_tokens across all
       tasks. Footnote: `* Input + output. Cache tokens shown in task detail.`
     - Above these cards a small line: "N task executions across M runs"
       where N = total task rows, M = distinct run count.
     - If no tasks have model (no cost data captured), replace the cards
       with a single banner: "No cost data captured yet for this project."

  3. Flat task table:
     Columns: Run Date | Task ID | Title | Status | Duration | Model | Cost
     - Each row is one task execution.
     - Click on a row navigates to /runs/:runId/tasks/:taskId (existing
       TaskDetail page).
     - Sortable column headers (click to toggle asc/desc, click another
       column to switch). Default sort: Run Date DESC.
     - Sort state managed via URL query string ?sort=<col>&dir=<asc|desc>
       so links are shareable / refresh-safe.
     - Format: Run Date as `MM/DD HH:mm`, Task ID as plain string,
       Title truncated to ~60 chars with full text on hover, Status as
       existing StatusBadge, Duration as `Mm Ss`, Model truncated to
       e.g. "sonnet-4" (last meaningful component), Cost via
       formatCost(value, 'aggregate') with auth-mode asterisk if max.
     - When cost_usd is 0 AND model is null, show "—" in Cost column
       (distinguishes "no data" from "$0.00").

  Empty states:
  - Zero tasks: "No tasks recorded for this project yet."
  - 404 from API: "Project not found." with back link.

  Implementation notes:
  - Use useApi<{...}>('/api/projects/' + projectId + '/tasks?sort=' + sort + '&dir=' + dir)
  - Aggregate the sums client-side from the returned tasks array — don't
    add another endpoint just for the totals. The flat list is small
    enough.
  - Use existing useParams, useNavigate, useSearchParams hooks for the
    URL state.
  - Match existing visual language (Tailwind classes used elsewhere,
    dark mode classes).

  Do NOT add a runs list / runs table. The user explicitly chose the
  Option B approach: one rich table.

  Do NOT add filtering controls (auth mode, date range, status). Just
  sorting for now per the user's choice.

  Do NOT add row expansion / inline drill-down. Click navigates to
  TaskDetail.

## T6: Wire ProjectView into Overview project cards (clickable navigation)
- STATUS: pending
- FILES: packages/dashboard/src/components/RunCard.tsx
- VERIFY: cd packages/dashboard && pnpm build && grep -q "/projects/" packages/dashboard/src/components/RunCard.tsx
- CRITIC: skip
- SPEC: After T5 the /projects/:id route renders a useful page. Make the
  Overview project cards link to it.

  Currently RunCard has a "View run details" link pointing to the LAST
  RUN's detail page. That's still a useful link for "what was the most
  recent run?" but the project-level deep link is more important now.

  In packages/dashboard/src/components/RunCard.tsx:
  - Make the project NAME (the card heading) a clickable link to
    /projects/:projectId.
  - KEEP the "View run details" link to the last run as a secondary
    affordance below.

  Use react-router-dom Link component (the existing pattern in this
  codebase). Hover state: underline or color change consistent with
  existing link styling.

  Do NOT change the card's data fields. Do NOT change RunCard props
  shape. Do NOT remove the "View run details" link.

## T7: Rename "Total Tokens" card label to "Tokens" everywhere it appears
- STATUS: pending
- FILES: packages/dashboard/src/components/CostSummary.tsx, packages/dashboard/src/pages/RunDetail.tsx, packages/dashboard/src/pages/ProjectView.tsx
- VERIFY: cd packages/dashboard && pnpm build && ! grep -r "Total Tokens" packages/dashboard/src/components/ packages/dashboard/src/pages/
- CRITIC: skip
- SPEC: Aggregate views call it "Tokens" or "Total Tokens" inconsistently.
  Per the agreed naming (single label "Cost", token noun is just "Tokens"
  with footnote clarifying scope), use "Tokens" everywhere in dashboard
  aggregate cards. The footnote explains "Input + output" — no need for
  "Total" prefix.

  Find every occurrence of "Total Tokens" (string literal or label) in:
  - packages/dashboard/src/components/CostSummary.tsx
  - packages/dashboard/src/pages/RunDetail.tsx
  - packages/dashboard/src/pages/ProjectView.tsx (after T5 lands)

  Replace each with "Tokens".

  The footnote `* Input + output. Cache tokens shown in task detail.`
  stays unchanged — it carries the scope information the "Total" prefix
  used to imply.

  Do NOT change anything in TaskDetail (per-task view, may have different
  conventions). Do NOT change CLI strings.

## T8: cost.ts per-project table — print footnote at bottom (Round A regression)
- STATUS: pending
- FILES: packages/cli/src/commands/cost.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "Token-based cost" packages/cli/src/commands/cost.ts && node packages/cli/dist/index.js cost 2>&1 | grep -q "Token-based cost"
- CRITIC: skip
- SPEC: Per Round A audit RISK 6: noxdev cost (per-project table) shows
  $COST* asterisk column but the footnote explaining it only prints in
  --global path. The per-project path never prints a footnote so the
  asterisk is dangling.

  In packages/cli/src/commands/cost.ts find the per-project table renderer.
  After the TOTAL row, print:
  `* Token-based cost. Max-mode tasks show equivalent API cost.`

  Also verify the per-run table renderer (used by `noxdev cost <project>`)
  has the footnote. If not, add it the same way.

  Use the EXACT footnote wording above — match the wording used in the
  dashboard (T2) so docs/screenshots are consistent.

  The VERIFY gate runs `node ... cost` and greps the actual output for
  "Token-based cost" — behavioral check, not just source presence.

  Do NOT change the table format or column headers. Do NOT change the
  --global footnote (it already exists, just with different wording —
  Round A audit noted the wording mismatch but updating it is in this
  task too: change cost.ts:383 from
  `"* Token-based cost combines API and equivalent Max usage costs."`
  to the EXACT string used everywhere else:
  `"* Token-based cost. Max-mode tasks show equivalent API cost."`).

## T9: README — document ProjectView and updated CLI footnote wording
- STATUS: pending
- FILES: README.md
- VERIFY: grep -q "Project view\|/projects/" README.md && grep -q "Token-based cost. Max-mode tasks show equivalent API cost." README.md
- CRITIC: skip
- SPEC: After T5 ships, the dashboard has a new ProjectView page. README's
  dashboard section should mention it.

  Find the dashboard section in README.md. Add a line documenting:
  - Click a project name from Overview to see project detail
  - Project page shows aggregate cost + flat task table with sortable columns
  - Sort options: cost desc (find expensive tasks), date desc (chronological),
    duration desc, task ID

  Also: replace any references to the old "Token-based cost combines API and
  equivalent Max usage costs" footnote wording with the canonical
  `* Token-based cost. Max-mode tasks show equivalent API cost.`

  Do NOT modify CHANGELOG.md (Round B is also plumbing — version bump waits
  for a natural release point with user-facing features).
