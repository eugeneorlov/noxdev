# noxdev v1.2.0: Cost Tracking + Merge Deletion + Verify Honesty

# Theme: noxdev does less of what no one uses (merge review) and more of what actually matters (cost visibility).
# Dependencies: current main (post-v1.0.5 tag, tonight's demo fixes merged).
# All tasks are directive. CRITIC: skip unless noted — this release is structural, the run engine + SQLite schema + dashboard all churn together.
# Run linearly. No phase gates.

## T1: SQLite migration — drop merge columns, add cost columns
- STATUS: done
- FILES: packages/cli/src/db/schema.sql, packages/cli/src/db/migrate.ts
- VERIFY: cd packages/cli && pnpm build && node -e "const {getDb} = require('./dist/db/db.js'); const db = getDb(); const cols = db.prepare('PRAGMA table_info(task_results)').all().map(c => c.name); if (cols.includes('merge_decision')) { console.error('merge_decision still present'); process.exit(1); } if (!cols.includes('input_tokens') || !cols.includes('cost_usd') || !cols.includes('model')) { console.error('cost columns missing'); process.exit(1); } console.log('OK'); "
- CRITIC: skip
- PUSH: auto
- SPEC: Evolve the task_results table. Drop merge machinery, add cost tracking.
  Update packages/cli/src/db/schema.sql:
  Remove columns from task_results: merge_decision, merged_at.
  Add columns to task_results:
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_read_tokens INTEGER,
    cache_write_tokens INTEGER,
    model TEXT,
    auth_mode_cost TEXT,  -- 'max' or 'api' — how to interpret cost_usd
    cost_usd REAL          -- for api: actual. for max: equivalent api cost.
  Add index: CREATE INDEX IF NOT EXISTS idx_task_results_started ON task_results(started_at);
  Update packages/cli/src/db/migrate.ts:
  Write an idempotent migration. SQLite does not support DROP COLUMN cleanly on older versions,
  so use the table-rebuild pattern:
    1. BEGIN;
    2. CREATE TABLE task_results_new with the new schema (no merge_decision, no merged_at, with cost columns)
    3. INSERT INTO task_results_new SELECT (all kept columns, NULL for new cost cols) FROM task_results;
    4. DROP TABLE task_results;
    5. ALTER TABLE task_results_new RENAME TO task_results;
    6. Recreate indexes (idx_task_results_run, idx_task_results_status, idx_task_results_started);
    7. COMMIT;
  Guard the migration: check if merge_decision column exists via PRAGMA table_info; only run the
  rebuild if it does. On subsequent runs the migration is a no-op.
  Do NOT touch the runs, projects, or tasks tables.

## T2: Verify honesty prompt tweak
- STATUS: done
- FILES: packages/cli/src/prompts/builder.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "execute the VERIFY command" dist/prompts/builder.js
- CRITIC: skip
- PUSH: auto
- SPEC: Add one line to the developer agent prompt that pushes the agent to run VERIFY as real
  shell rather than narrate success. This is the entire "verify enforcement" work for v1.2.0 —
  trust-the-agent model, no run-engine enforcement, no exec lifecycle changes.
  In packages/cli/src/prompts/builder.ts, find where the VERIFY field is rendered into the prompt.
  It currently passes VERIFY as descriptive text. Add an explicit instruction immediately after:
    "Before reporting this task as complete, execute the VERIFY command as a real shell command
    in the worktree. Include the exact command output and exit code in your completion summary.
    If the VERIFY command exits non-zero, iterate on your changes until it passes, or report
    the failure honestly — do not claim success based on reasoning alone."
  Keep existing prompt structure. Do not rewrite unrelated sections.

## T3: Remove noxdev merge CLI command
- STATUS: done
- FILES: packages/cli/src/commands/merge.ts, packages/cli/src/index.ts
- VERIFY: cd packages/cli && pnpm build && ! node dist/index.js merge --help 2>&1 | grep -q "Interactive merge" && ! ls dist/commands/merge.js 2>/dev/null
- CRITIC: skip
- PUSH: auto
- SPEC: Delete noxdev merge entirely. It was built for a workflow no one uses
  (per-commit human approval). The replacement workflow is `cd ~/projects/X && git merge noxdev/X` —
  a single muscle-memory git command. No wrapper, no convenience command.
  1. Delete packages/cli/src/commands/merge.ts.
  2. In packages/cli/src/index.ts, remove the import of the merge command module and remove
     the commander `.command('merge')` registration block. Remove any help-text references to merge.
  3. If the banner / help output (see commands/help or similar) lists commands explicitly, remove
     "merge" from that list too. Use findCliRoot-style path resolution if you need to locate files.
  Do NOT touch status, log, run, init, remove, projects, dashboard, doctor.

## T4: Remove merge API routes from dashboard backend
- STATUS: done
- FILES: packages/dashboard/src/api/routes/merge.ts, packages/dashboard/src/api/routes/index.ts, packages/dashboard/src/api/routes/tasks.ts
- VERIFY: cd packages/dashboard && pnpm build && ! ls src/api/routes/merge.ts 2>/dev/null && ! grep -r "merge_decision" src/ && ! grep -rE "(/api/merge|/merge/:projectId|tasks/:taskId/merge)" src/api/
- CRITIC: skip
- PUSH: auto
- SPEC: Delete merge routes from the dashboard API.
  1. Delete packages/dashboard/src/api/routes/merge.ts.
  2. In packages/dashboard/src/api/routes/index.ts, remove the import and the
     `router.use('/merge', mergeRouter)` mount.
  3. In packages/dashboard/src/api/routes/tasks.ts, remove the
     POST /api/runs/:id/tasks/:taskId/merge handler (the one that updated merge_decision).
  4. Remove any SELECT clauses in the remaining tasks/runs route queries that reference
     merge_decision or merged_at. These columns no longer exist.

## T5: Remove merge review page and routes from dashboard UI
- STATUS: done
- FILES: packages/dashboard/src/pages/MergeReview.tsx, packages/dashboard/src/App.tsx
- VERIFY: cd packages/dashboard && pnpm build && ! ls src/pages/MergeReview.tsx 2>/dev/null && ! grep -r "MergeReview" src/
- CRITIC: skip
- PUSH: auto
- SPEC: Delete the merge review page and its route.
  1. Delete packages/dashboard/src/pages/MergeReview.tsx.
  2. In packages/dashboard/src/App.tsx, remove the import of MergeReview and remove the
     `<Route path="/merge/:projectId" ... />` declaration.
  3. If any component (nav header, Overview cards) has a link to /merge/:projectId, remove it.
     Search src/ for "/merge/" to find references.

## T6: Strip merge UI from TaskRow and TaskDetail
- STATUS: done
- FILES: packages/dashboard/src/components/TaskRow.tsx, packages/dashboard/src/pages/TaskDetail.tsx
- VERIFY: cd packages/dashboard && pnpm build && ! grep -rE "(merge_decision|Approve|Reject|merge:)" src/components/TaskRow.tsx src/pages/TaskDetail.tsx
- CRITIC: skip
- PUSH: auto
- SPEC: Remove merge badges and approve/reject UI.
  In packages/dashboard/src/components/TaskRow.tsx: remove the merge badge rendering entirely
  (the one with "merge: pending/approved/rejected" labels). Do not replace it. The row shows
  status badge, duration, commit SHA, and nothing merge-related.
  In packages/dashboard/src/pages/TaskDetail.tsx: remove the entire "Merge" section, including
  the Approve button, Reject button, the help text ("Run noxdev merge in terminal..."), and
  the POST call to the merge endpoint. Remove any useState tied to merge decision.
  Keep everything else on the page: spec, files, execution info, diff viewer, logs section.

## T7: JSONL session parser — extract token usage
- STATUS: done
- FILES: packages/cli/src/cost/parser.ts, packages/cli/src/cost/types.ts
- VERIFY: cd packages/cli && pnpm build && node -e "const {parseSessionUsage} = require('./dist/cost/parser.js'); if (typeof parseSessionUsage !== 'function') { console.error('parseSessionUsage not exported'); process.exit(1); } console.log('OK');"
- CRITIC: skip
- PUSH: auto
- SPEC: Build the parser that reads a Claude Code session JSONL and returns totals.
  Claude Code writes session logs at ~/.claude/projects/<encoded-worktree-path>/<session-id>.jsonl.
  Each line is a JSON object. Assistant-turn lines contain a "message" field with a "usage"
  object: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
  and the top-level or message-level "model" field (e.g., "claude-sonnet-4-20250514",
  "claude-opus-4-20250514"). Some lines are user turns or tool results with no usage — skip those.
  Create packages/cli/src/cost/types.ts exporting:
    export interface SessionUsage {
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      model: string | null;  // last-seen model in the session, or null if none found
    }
  Create packages/cli/src/cost/parser.ts exporting:
    export function parseSessionUsage(jsonlPath: string): SessionUsage
  Implementation:
    1. Read the file synchronously (fs.readFileSync). If the file doesn't exist,
       return zeros and model: null — don't throw.
    2. Split on newlines, filter empty lines.
    3. For each line, try JSON.parse in a try/catch (ignore malformed lines).
    4. Look for a usage object at line.message?.usage OR line.usage.
    5. Accumulate the four token counts. Missing fields default to 0.
    6. Track the model string from line.message?.model OR line.model — keep the last non-null value.
    7. Return the accumulated SessionUsage.
  Also export a helper:
    export function findLatestSessionFile(worktreePath: string, afterTimestamp: number): string | null
  Implementation:
    1. Encode the worktree path the same way Claude Code does: replace / with -, KEEPING the
       leading dash. Example: /home/eugene218/worktrees/noxdev becomes
       -home-eugene218-worktrees-noxdev. Use path.resolve first, then replaceAll('/', '-').
       (Verified against actual ~/.claude/projects/ directory — leading dash is kept.)
    2. Build the projects dir: path.join(os.homedir(), '.claude', 'projects', encoded).
    3. If dir doesn't exist, return null.
    4. Read all *.jsonl files, filter to those with mtimeMs >= afterTimestamp.
    5. Return the path of the one with the highest mtimeMs, or null if none match.
  This supports the run engine in T9 which captures a "container start" timestamp before the agent runs.

## T8: Pricing table module with config override
- STATUS: done
- FILES: packages/cli/src/cost/pricing.ts
- VERIFY: cd packages/cli && pnpm build && node -e "const {computeCostUsd} = require('./dist/cost/pricing.js'); const c = computeCostUsd({input_tokens: 1000000, output_tokens: 1000000, cache_read_tokens: 0, cache_write_tokens: 0, model: 'claude-sonnet-4-20250514'}); if (typeof c !== 'number' || c <= 0) { console.error('cost not computed:', c); process.exit(1); } console.log('OK:', c);"
- CRITIC: skip
- PUSH: auto
- SPEC: Ship a hardcoded pricing table with a user-editable override path.
  Create packages/cli/src/cost/pricing.ts.
  Hardcoded DEFAULT_PRICING (USD per 1M tokens, current Anthropic public pricing):
    'claude-opus-4-20250514':     { input: 15.00, output: 75.00, cache_read: 1.50,  cache_write: 18.75 }
    'claude-sonnet-4-20250514':   { input:  3.00, output: 15.00, cache_read: 0.30,  cache_write:  3.75 }
    'claude-haiku-4-5-20251001':  { input:  1.00, output:  5.00, cache_read: 0.10,  cache_write:  1.25 }
  (If a more recent model string appears, it falls through to a default that returns 0 cost with a
  warning comment — we prefer underreporting to guessing.)
  Exports:
    export interface ModelPrice {
      input: number; output: number; cache_read: number; cache_write: number;
    }
    export function loadPricing(): Record<string, ModelPrice>
      // Loads DEFAULT_PRICING, then if ~/.noxdev/pricing.json exists, JSON.parse it and
      // Object.assign into defaults (user overrides win). Cache result per-process.
    export function computeCostUsd(usage: SessionUsage): number
      // Returns 0 if usage.model is null or not in pricing table.
      // Otherwise: (input * input_price + output * output_price + cache_read * cache_read_price
      //             + cache_write * cache_write_price) / 1_000_000
      // Rounded to 4 decimal places (Math.round(x * 10000) / 10000).
  Import SessionUsage from './types'.

## T9: Wire cost capture into the run engine
- STATUS: failed
- FILES: packages/cli/src/commands/run.ts, packages/cli/src/db/queries.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "parseSessionUsage" dist/commands/run.js && grep -q "computeCostUsd" dist/commands/run.js
- CRITIC: review
- PUSH: gate
- SPEC: After each task's agent container exits, capture token usage and cost from the
  Claude Code session JSONL and write to task_results.
  In packages/cli/src/commands/run.ts:
  1. Before launching the agent container for a task, capture const containerStartMs = Date.now().
  2. After the agent container exits (whether success or failure), AND after the critic step
     (if any) has run, call a new helper captureTaskCost(worktreePath, containerStartMs, authMode).
  3. The helper lives in a new file or inline — your call — and does:
       a. findLatestSessionFile(worktreePath, containerStartMs) → jsonlPath
       b. If jsonlPath is null, write all-zero cost fields and return (no session file found, not an error).
       c. parseSessionUsage(jsonlPath) → usage
       d. computeCostUsd(usage) → costUsd
       e. Return { input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                   model, auth_mode_cost: authMode, cost_usd: costUsd }
     authMode here is 'max' or 'api' — pull from the same variable the existing code uses to
     decide which docker-run script to invoke. For max, cost_usd is the "equivalent API cost"
     (informational); for api, it's the actual billed amount.
  4. Pass the result into the existing SQLite update for the task_result row.
  In packages/cli/src/db/queries.ts: extend the task_result update function (or add a new
  updateTaskCost function) that writes the six cost columns. If adding a new function, call it
  right after the existing finish-task update in run.ts.
  Do NOT change the container lifecycle, auth flow, or critic invocation. This is observation-only.

## T10: CLI surfaces — noxdev cost command + status/log integration
- STATUS: failed
- FILES: packages/cli/src/commands/cost.ts, packages/cli/src/commands/status.ts, packages/cli/src/commands/log.ts, packages/cli/src/index.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js cost --help | grep -qi "tokens" && node dist/index.js cost --help | grep -qi "since"
- CRITIC: review
- PUSH: gate
- SPEC: Build the noxdev cost command and surface cost in existing commands.
  New file packages/cli/src/commands/cost.ts, register in index.ts:
    noxdev cost [project]              # summary for one project, or global if omitted
      --since <spec>                   # '7d', '30d', 'YYYY-MM-DD', or 'all' (default: all)
      --all                            # per-project breakdown instead of flat totals
  Output layout (chalk-colored, aligned):
    When run without --all for a specific project or global:
      noxdev cost — <project or "all projects">  [since <date range>]
        Input tokens        X,XXX,XXX
        Output tokens         XXX,XXX
        Cache read tokens   X,XXX,XXX
        Cache write tokens    XXX,XXX
        ─────────────────────────────
        API tasks              42 tasks    $X.XX
        Max tasks (equiv.)     18 tasks    $X.XX*
        Total                  60 tasks    $X.XX
        * Max cost is equivalent API cost — actual Max usage is flat-rate.
    When run with --all:
      noxdev cost — per project  [since <date range>]
        PROJECT              TASKS   IN-TOK    OUT-TOK   $API      $EQUIV*
        mit-nexus            42      1.2M      340K      $3.45     $-
        noxdev               18      850K      220K      $-        $5.12*
        ────────────────────────────────────────────────────────────────
        TOTAL                60      2.05M     560K      $3.45     $5.12
  Queries use SUM() grouped by auth_mode_cost; --since translates to WHERE started_at >= date(...).
  Format numbers with thousand separators (Intl.NumberFormat 'en-US').
  When a model column is NULL (older rows pre-1.2.0), skip them silently with a footer note:
    "Note: N older tasks have no cost data (pre-v1.2.0 runs)."
  Update packages/cli/src/commands/status.ts:
    After the existing last-run summary, append a line:
      "Cost: $X.XX API + $X.XX Max-equiv  ·  X.XM input / X.XM output tokens"
    Pull from the same run_id via SUM on task_results.
  Update packages/cli/src/commands/log.ts:
    For the task being shown, add a "Cost" section after "Execution":
      Cost
        Model              claude-sonnet-4-20250514
        Input tokens       12,345
        Output tokens      3,456
        Cache read         98,765
        Cache write        1,234
        Cost               $0.0234  (api)        or   $0.0234 equivalent  (max)
    If cost_usd is NULL or 0 and model is NULL, print "Cost: no data captured".

## T11: Dashboard API — cost endpoints + task/run fields
- STATUS: failed
- FILES: packages/dashboard/src/api/routes/cost.ts, packages/dashboard/src/api/routes/index.ts, packages/dashboard/src/api/routes/runs.ts, packages/dashboard/src/api/routes/tasks.ts
- VERIFY: cd packages/dashboard && pnpm build && grep -q "/cost/summary" dist/api/routes/cost.mjs 2>/dev/null || grep -q "cost/summary" dist/api/routes/cost.js 2>/dev/null || grep -qr "cost/summary" dist/api/
- CRITIC: review
- PUSH: gate
- SPEC: Add cost endpoints and fold cost fields into existing endpoints.
  New file packages/dashboard/src/api/routes/cost.ts — Express router:
    GET /api/cost/summary?since=<spec>
      Returns { tokens: {input, output, cache_read, cache_write},
                api: {tasks, cost_usd}, max: {tasks, cost_usd_equivalent}, total_tasks }
      aggregated globally over the since window.
      since accepts: '7d', '30d', 'YYYY-MM-DD', 'all'. Default 'all'.
    GET /api/cost/projects?since=<spec>
      Returns array of per-project rows:
        [{ project_id, display_name, tasks, input_tokens, output_tokens,
           api_cost_usd, max_cost_usd_equivalent }]
  Parse the 'since' param with a small helper (shared with T10's parser if practical — for v1.2.0
  duplicate it if sharing requires refactor gymnastics).
  Update packages/dashboard/src/api/routes/index.ts: mount router.use('/cost', costRouter).
  Update packages/dashboard/src/api/routes/runs.ts: the GET /api/runs/:id/tasks/:taskId
  response already returns the task_result row; confirm the new cost columns flow through (they
  will because you're selecting *). If there's an explicit column list, add:
  input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, model, auth_mode_cost, cost_usd.
  Update packages/dashboard/src/api/routes/tasks.ts (if it exists as a separate file — in the
  existing code tasks is inside runs.ts; check both).

## T12: Dashboard UI — Overview cost summary + TaskRow cost + TaskDetail cost section
- STATUS: pending
- FILES: packages/dashboard/src/pages/Overview.tsx, packages/dashboard/src/components/TaskRow.tsx, packages/dashboard/src/pages/TaskDetail.tsx, packages/dashboard/src/components/CostSummary.tsx
- VERIFY: cd packages/dashboard && pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: Surface cost in existing dashboard pages.
  New component packages/dashboard/src/components/CostSummary.tsx:
    Props: { summary: CostSummaryData | null, loading: boolean }
    Renders a card with three columns: API cost, Max equivalent cost, total tokens.
    Use Tailwind: rounded-lg border p-4, grid grid-cols-3 gap-4, number formatting via
    Intl.NumberFormat. Tokens shown as compact (1.2M, 340K) using a small formatNumber helper.
  Update packages/dashboard/src/pages/Overview.tsx:
    Add CostSummary at the top of the page, above the project grid.
    Fetch GET /api/cost/summary (no since param, defaults to all) via useApi hook.
    While loading, show CostSummary in loading state; then render with data.
  Update packages/dashboard/src/components/TaskRow.tsx:
    In the collapsed row, after the duration, add a small cost display:
      - If cost_usd is null/0: don't render anything (silent for pre-1.2.0 rows).
      - If auth_mode_cost === 'api': "$0.03"
      - If auth_mode_cost === 'max': "$0.03*" in a muted color
    Use text-xs font-mono. Tooltip on the asterisk via title="Max equivalent API cost".
  Update packages/dashboard/src/pages/TaskDetail.tsx:
    Add a new section titled "Cost" after "Execution":
      Model             claude-sonnet-4-20250514
      Input tokens      12,345
      Output tokens     3,456
      Cache read        98,765
      Cache write       1,234
      Cost              $0.0234 (api)  or  $0.0234 equivalent (max)
    Format in the same styled definition-list pattern already used by the Execution section.
    If cost_usd is null and model is null, render "No cost data captured for this task."
  Do NOT add a new standalone Cost page — Overview + per-task detail covers v1.2.0 scope.
  (If Eugene wants a dedicated /cost page later, it's a trivial add on top of the existing
  /api/cost/projects endpoint.)

## T13: Update README and CHANGELOG
- STATUS: pending
- FILES: README.md, CHANGELOG.md
- VERIFY: grep -q "noxdev cost" README.md && grep -q "1.2.0" CHANGELOG.md && ! grep -q "noxdev merge" README.md
- CRITIC: skip
- PUSH: auto
- SPEC: Update docs to reflect v1.2.0 changes.
  README.md changes:
    1. In the Quickstart section, remove the `noxdev merge my-project` line. Replace with:
       `# Merge when ready`
       `cd ~/projects/my-project && git merge noxdev/my-project`
    2. In the Commands section, remove the `noxdev merge [project]` row from the command list.
    3. In the Commands section, add a new row:
       `noxdev cost [project]           # Token usage and cost summary (global or per-project)`
    4. Add a new top-level section "Cost tracking" after the "Dashboard" section:
       Explain that noxdev captures token usage and cost per task from Claude Code session logs.
       Show example output of `noxdev cost --all`. Explain the Max-equivalent cost: actual Max
       usage is flat-rate, the dollar number is "what this would have cost via API."
       Mention pricing override at ~/.noxdev/pricing.json.
    5. In the Safety section, remove the line about "No auto-push, ever" if it references
       merge review. Rework to: commits stay on the worktree branch until you run git merge.
  CHANGELOG.md: add at the top (or create the file if it doesn't exist) a v1.2.0 entry:
    ## [1.2.0] - <today's date YYYY-MM-DD>
    ### Added
    - Token usage and cost tracking per task, project, and globally
    - `noxdev cost` command with `--since` and `--all` flags
    - Cost summary on dashboard Overview and per-task detail pages
    - Pricing override via ~/.noxdev/pricing.json
    - Max-authenticated tasks show equivalent API cost for reference
    ### Changed
    - Agent prompt now instructs the model to execute VERIFY as a real shell command
      and report exit code honestly
    ### Removed
    - `noxdev merge` command — spec-driven workflows don't need per-commit review.
      Use `git merge noxdev/<project>` directly.
    - Merge review page and approve/reject UI from the dashboard
    - `merge_decision` and `merged_at` columns from the task_results table (migrated on first run)

## T14: Version bump
- STATUS: pending
- FILES: packages/cli/package.json, packages/dashboard/package.json
- VERIFY: grep -q '"version": "1.2.0"' packages/cli/package.json && grep -q '"version": "1.2.0"' packages/dashboard/package.json
- CRITIC: skip
- PUSH: auto
- SPEC: Bump both package versions from 1.0.5 to 1.2.0. No other changes.
  Use a direct edit — don't run npm version (it creates a git tag, and tags are done manually
  after verification). Find the "version" line in each package.json and set to "1.2.0".
