# Cost display Round A — cleanup, bug fixes, rename, TypeScript health

# Audit: .audits/audit-cost-display-v2-2026-04-15.md
# Round B (project-page redesign with flat task table) waits for Round A audit-after.

## T1: Flatten /api/cost/runs/:runId response and wire dead query function
- STATUS: done
- FILES: packages/dashboard/src/api/routes/cost.ts, packages/dashboard/src/pages/RunDetail.tsx, packages/cli/src/db/queries.ts
- VERIFY: cd packages/dashboard && pnpm build && grep -q "api_cost_usd" packages/dashboard/dist/api/server.js && grep -q "max_cost_usd_equivalent" packages/dashboard/dist/api/server.js && grep -q "tasks_with_cost" packages/dashboard/dist/api/server.js && cd ../cli && pnpm build && grep -q "getRunCostBreakdown" packages/cli/dist/db/queries.js
- CRITIC: skip
- SPEC: RunDetail shows $NaN on all three cost cards because the API returns
  nested `{ tokens: { input }, api: { cost_usd }, max: { cost_usd_equivalent } }`
  but the RunCostBreakdown TS interface declares flat fields. Component reads
  `costData.api_cost_usd` → undefined → $NaN. See audit RISK 1.

  Decision: flatten the API to match the component. Single source of truth via
  the dead getRunCostBreakdown query function.

  Step 1 — Update getRunCostBreakdown in packages/cli/src/db/queries.ts (audit
  located it at lines 193-210). Return type and SQL must produce this exact
  flat shape:
  ```
  {
    run_id, total_tasks, tasks_with_cost,
    earliest_started_at, latest_finished_at,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
    api_tasks, api_cost_usd,
    max_tasks, max_cost_usd_equivalent
  }
  ```
  tasks_with_cost = `SUM(CASE WHEN tr.model IS NOT NULL THEN 1 ELSE 0 END)`.

  Step 2 — In packages/dashboard/src/api/routes/cost.ts find the
  /api/cost/runs/:runId handler (audit located at lines 247-302). Delete the
  inline SQL. Import getRunCostBreakdown from the cli package. Call it,
  return its result directly. The route becomes a thin wrapper.

  Step 3 — In packages/dashboard/src/pages/RunDetail.tsx the existing
  RunCostBreakdown interface at lines 45-57 already declares the flat shape.
  Verify it matches. The component code reading `costData.api_cost_usd` etc.
  now resolves correctly.

  The line 220 guard `costData.tasks_with_cost === 0` now triggers when no
  tasks have model — the "no cost data" warning shows instead of NaN cards.

  Do NOT change /api/cost/summary or /api/cost/projects routes. Those have
  their own consumers and aren't broken.

## T2: Unify formatCost — single API with mode parameter, delete all alternatives
- STATUS: done
- FILES: packages/cli/src/lib/format.ts, packages/dashboard/src/lib/format.ts, packages/cli/src/commands/cost.ts, packages/cli/src/commands/status.ts, packages/cli/src/commands/log.ts, packages/dashboard/src/components/TaskRow.tsx, packages/dashboard/src/components/CostSummary.tsx, packages/dashboard/src/pages/TaskDetail.tsx, packages/dashboard/src/pages/RunDetail.tsx, packages/dashboard/src/components/RunCard.tsx
- VERIFY: cd packages/cli && pnpm build && cd ../dashboard && pnpm build && ! grep -rE "function formatCost|const formatCost\s*=" packages/cli/src/commands/ packages/dashboard/src/components/ packages/dashboard/src/pages/ && ! grep -r "formatCostDisplay\|getCostProps\|formatCostIntl" packages/dashboard/src/ && ! grep -rE "\.toFixed\(3\)|\.toFixed\(4\)" packages/dashboard/src/components/ packages/dashboard/src/pages/
- CRITIC: skip
- SPEC: Previous round's T7 marked done but shipped to a different spec. Five
  formatting approaches coexist in the dashboard: formatCost, formatCostDisplay,
  getCostProps, formatCostIntl, raw .toFixed(3), inline Intl. Dashboard
  formatCost is dead code (exported, never imported). RunCard uses raw
  .toFixed(3). See audit RISK 2 + Section 4.

  Replace ALL of them with one API. The VERIFY gate has multiple negative
  greps that fail if any old formatter name remains anywhere it shouldn't.

  Step 1 — Replace packages/cli/src/lib/format.ts entire contents with:
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
  the IDENTICAL three functions above. Mirror — character-for-character.
  Delete formatCostDisplay, getCostProps, formatCostIntl.

  Step 3 — Update every consumer:
  CLI:
    cost.ts → formatCost(value, 'aggregate') for tables and summaries
    status.ts → formatCost(value, 'aggregate')
    log.ts → formatCost(value, 'detail') for per-task drill-down
  Dashboard:
    TaskRow.tsx → formatCost(value, 'aggregate'). Asterisk + tooltip suffix
                  for max-mode stays local to TaskRow.
    CostSummary.tsx → formatCost(value, 'aggregate')
    TaskDetail.tsx → formatCost(value, 'detail'). The (api) / equivalent (max)
                     suffix logic stays local to TaskDetail.
    RunDetail.tsx → formatCost(value, 'aggregate'). Delete the inline
                    formatCost at lines 74-81.
    RunCard.tsx → formatCost(value, 'aggregate'). Delete raw .toFixed(3) at
                  line 78. This was the most egregious bypass.

  Step 4 — Delete every old implementation: formatCostDisplay, getCostProps,
  formatCostIntl, RunDetail's inline formatCost, RunCard's raw .toFixed(3),
  any local formatCost / formatNumber / formatTokens in cost.ts / status.ts /
  log.ts.

  Do NOT change auth-mode suffix conventions. Do NOT touch the asterisk-with-
  tooltip pattern in TaskRow. Only numeric formatting gets unified.

## T3: Aggregate token displays = input + output only (exclude cache)
- STATUS: done
- FILES: packages/dashboard/src/components/CostSummary.tsx, packages/dashboard/src/pages/RunDetail.tsx
- VERIFY: cd packages/dashboard && pnpm build && ! grep -E "tokens\.cache_read|tokens\.cache_write|cache_read_tokens.*\+|cache_write_tokens.*\+" packages/dashboard/src/components/CostSummary.tsx && ! grep -E "tokens\.cache_read|tokens\.cache_write|cache_read_tokens.*\+|cache_write_tokens.*\+" packages/dashboard/src/pages/RunDetail.tsx
- CRITIC: skip
- SPEC: CostSummary "Total Tokens" card shows 24.8M because totalTokens sums
  all four token types including cache_read which dominates by ~100x.
  Misleading — users expect "tokens" to mean billable work. See audit
  Section 2 + RISK 3.

  Rule: at AGGREGATE level (CostSummary, RunDetail header, project cards),
  "Tokens" = input + output ONLY. Cache tokens stay visible at DETAIL level
  (TaskDetail, CLI cost --global, CLI per-task table) — those are unchanged.

  Step 1 — In packages/dashboard/src/components/CostSummary.tsx find the
  totalTokens computation (audit located at lines 58-59). Change to:
  `const totalTokens = tokens.input + tokens.output;`

  Step 2 — Same file, the "Total Tokens" card. Below the value, add a small
  footnote in muted text:
  `* Input + output. Cache tokens shown in task detail.`

  Step 3 — In packages/dashboard/src/pages/RunDetail.tsx the token computation
  at line 254 already does input + output (correct). After T1's flat shape
  fix it will read `costData.input_tokens + costData.output_tokens`. Add the
  same footnote below the Tokens card value:
  `* Input + output. Cache tokens shown in task detail.`

  CLI is already correct: per-project table uses IN-TOK / OUT-TOK columns,
  per-task table uses input + output, --global prints all four separately
  as a detail view. No CLI changes needed.

  Do NOT remove cache token display from TaskDetail. Do NOT remove cache
  display from CLI --global. Do NOT change the underlying schema or queries.

## T4: Collapse "API Cost" + "Max Equivalent" → single "Cost" label
- STATUS: done
- FILES: packages/dashboard/src/components/CostSummary.tsx, packages/dashboard/src/pages/RunDetail.tsx, packages/dashboard/src/components/RunCard.tsx, packages/cli/src/commands/cost.ts, packages/cli/src/commands/status.ts
- VERIFY: cd packages/dashboard && pnpm build && cd ../cli && pnpm build && ! grep -rE "API Cost|Max Equivalent|\\\$EQUIV|\\\$MAX-EQ|\\\$API\b|Max equivalent API cost|Max tasks \(equiv|Max-equiv" packages/dashboard/src/components/ packages/dashboard/src/pages/ packages/cli/src/commands/ && grep -q "Token-based cost" packages/dashboard/src/components/CostSummary.tsx && grep -q "Token-based cost" packages/cli/src/commands/cost.ts
- CRITIC: skip
- SPEC: 16 user-facing strings across 6 files use "API Cost" / "Max Equivalent"
  / "$EQUIV" / "$MAX-EQ" naming. Collapse all to a single "Cost" label. See
  audit Section 5 for full inventory.

  WHY: subscription users (Max) and API users care about the same number for
  the same reason — what is this work worth in token terms? Auth mode is
  implementation detail. One label, one footnote, no qualifiers.

  Footnote (use this exact wording everywhere):
  `* Token-based cost. Max-mode tasks show equivalent API cost.`

  Dashboard:

  CostSummary.tsx — currently has 3 cards: "API Cost", "Max Equivalent Cost",
  "Total". Replace with 2 cards: "Cost" and "Tokens". Cost value =
  api_cost_usd + max_cost_usd_equivalent. Add footnote in muted small text
  below the Cost value.

  RunDetail.tsx — same: 3 cost cards become 1 "Cost" card. Same footnote
  pattern. Result: 2 cards total ("Cost" and "Tokens").

  RunCard.tsx (project card on Overview) — already shows combined cost.
  Drop the lowercase "cost" word after the dollar amount; the dollar sign
  tells you what it is. No footnote (cards are too small).

  CLI:

  cost.ts per-project table — replace columns "$API" and "$EQUIV*" with
  single column "$COST*". Value = api_cost_usd + max_cost_usd_equivalent.
  Print the footnote at the bottom of the table after the total row.

  cost.ts per-run table — replace columns "$API" and "$MAX-EQ" (plus
  existing "$TOTAL" if present) with single column "$COST*". Same footnote.

  cost.ts --global summary — replace separate "API tasks" and
  "Max tasks (equiv.)" labels and lines with single "Cost: $X.XX*" line and
  total tasks count. Replace the existing footnote at line 392 with the new
  wording.

  status.ts — currently prints `Cost: $X.XX API + $Y.YY Max-equiv · ...`.
  Change to `Cost: $Z.ZZ* · NNK input / NNK output tokens` where Z.ZZ =
  api + max sum. Print footnote on a new indented line below, only when
  cost is non-zero.

  KEEP per-task suffix conventions. TaskDetail.tsx and log.ts show
  "(api)" or "equivalent (max)" suffix on individual task costs — these
  stay. Only aggregate/rollup views drop the qualifier.

  Do NOT modify TaskDetail.tsx. Do NOT modify log.ts. Do NOT change
  auth_mode_cost field in schema or queries.

## T5: Label RunCard cost line as all-time (resolve scope ambiguity)
- STATUS: done
- FILES: packages/dashboard/src/components/RunCard.tsx
- VERIFY: cd packages/dashboard && pnpm build && grep -q "All-time" packages/dashboard/src/components/RunCard.tsx
- CRITIC: skip
- SPEC: Project card mixes last-run task counts (completed/failed/total) with
  all-time cost aggregate. Both displayed without scope labels. User cannot
  tell whether $12.77 is last run or lifetime. See audit Section 6.

  Quick fix: prefix the cost line with explicit scope.

  In packages/dashboard/src/components/RunCard.tsx find the cost line (audit
  located at line 78). After T4 it renders just the formatted cost. Wrap it
  with explicit scope context:
  ```
  <div className="text-xs text-gray-500 dark:text-gray-400">
    All-time: {formatCost(totalCost, 'aggregate')}
  </div>
  ```

  If `total_cost_tasks === 0` (no cost data captured for any run), render
  nothing instead of "All-time: $0.00" — that would mislead (looks like
  the project costs nothing rather than "no data captured").

  The "Last run: 3h ago" text already establishes that the rest of the card
  is last-run scoped. Adding "All-time:" to the cost line resolves the
  ambiguity.

  Do NOT add a date range picker (Round B). Do NOT change the API.

## T6: TypeScript build passes cleanly in both packages
- STATUS: done
- FILES: packages/cli/src/db/connection.ts, packages/dashboard/src/api/db.ts, packages/dashboard/src/pages/Overview.tsx, packages/dashboard/tsconfig.json, packages/cli/src/commands/__tests__/log.test.ts, packages/cli/src/commands/__tests__/run-multi.test.ts, packages/cli/src/commands/__tests__/status.test.ts, packages/cli/src/db/__tests__/queries.test.ts
- VERIFY: cd packages/cli && npx tsc --noEmit && cd ../dashboard && npx tsc --noEmit
- CRITIC: skip
- SPEC: ~29 TypeScript errors across both packages. Some recent (cross-rootDir
  import added with v1.3.x cost work), some pre-existing. See audit Section 4
  for full enumeration. Fix all of them. After this task, tsc --noEmit exits
  zero in both packages.

  WHY NOW: Round B will add new endpoints, components, types. If TS doesn't
  catch type mismatches, every Round B task becomes another shipped-broken-
  at-integration like T5. TS as a real guardrail = cheap audit-after.

  Read .audits/audit-cost-display-v2-2026-04-15.md Section 4 for the
  enumerated errors.

  Category 1 — runMigrations option (5 occurrences):
  OpenDbOptions in packages/cli/src/db/connection.ts has no runMigrations
  property but multiple files pass it. Add `runMigrations?: boolean;` to
  the interface. In openDb implementation, when runMigrations === true, call
  migrate() after opening the connection. Otherwise skip. This makes existing
  call sites valid AND gives them the behavior they intended.

  Category 2 — cross-package import (1 occurrence):
  dashboard/src/api/db.ts:3 imports from `../../../cli/src/db/connection.js`
  — violates rootDir. In packages/dashboard/tsconfig.json add to
  compilerOptions:
  ```
  "paths": {
    "@noxdev/cli/db": ["../cli/src/db/connection.ts"]
  }
  ```
  Update the import in dashboard/src/api/db.ts to use the alias.

  Category 3 — useApi typing (Overview.tsx and other consumers):
  costSummary at Overview.tsx:72 is typed unknown because useApi has no
  generic. Find the useApi hook implementation. Add generic:
  `function useApi<T = unknown>(url: string): { data: T | null, ... }`
  Update callers in dashboard/src/pages/ and dashboard/src/components/ to
  pass the expected type. For Overview.tsx:102 (projects possibly null in
  .map): add `projects?.map(...)` or default to empty array.

  Category 4 — namespace misuse for Database.Database (CLI ~25 errors):
  Run `npx tsc --noEmit` in cli to enumerate. Common pattern:
  Database.Database used where DatabaseSync from node:sqlite is correct.
  Fix each to use the correct type from openDb's return type or the
  imported DatabaseSync type.

  Category 5 — bigint/number mismatches:
  SQLite returns bigint for some columns. For each error, either cast
  Number(value) at the boundary or update the type annotation to bigint.

  Do NOT add `any` casts to silence errors. Use `unknown` + runtime guards
  if a type genuinely can't be expressed. The point is to make TS a real
  guardrail.

## T7: Delete dead --all flag
- STATUS: done
- FILES: packages/cli/src/commands/cost.ts
- VERIFY: cd packages/cli && pnpm build && ! grep -q "'--all'" packages/cli/src/commands/cost.ts
- CRITIC: skip
- SPEC: cost.ts:347 declares `--all` option but never reads it in the action
  handler. T6 from previous round restructured the CLI so --all is now
  redundant with the default (no-args) per-project breakdown. README already
  documents the new structure without --all. See audit Section 4.

  Delete the `.option('--all', ...)` line from the commander definition.

  Other dead code (formatCostDisplay, getCostProps, formatCostIntl,
  RunDetail's inline formatCost, RunCard's raw .toFixed(3), dashboard's
  unused formatCost export) is handled by T2. getRunCostBreakdown is
  wired up by T1 — no longer dead.

  Do NOT change anything else in cost.ts.

## T8: README — reflect new "Cost" label and Round A changes
- STATUS: done
- FILES: README.md
- VERIFY: grep -q "Token-based cost" README.md && ! grep -E "API Cost|Max Equivalent|\\\$API|\\\$EQUIV" README.md
- CRITIC: skip
- SPEC: README cost section may show example output with old "$API" /
  "$EQUIV" / "API Cost" / "Max Equivalent" labels. Update to reflect the
  new single "Cost" column.

  Find the cost section in README.md. Update example output snippets:
    - Single "$COST*" column instead of "$API" / "$MAX-EQ" / "$EQUIV"
    - Footnote: `* Token-based cost. Max-mode tasks show equivalent API cost.`
    - "Tokens" or "Input/Output Tokens" labels in aggregates (not API/Max
      breakdowns)
    - Cache tokens only mentioned in per-task detail examples

  Do NOT modify CHANGELOG.md (Round A is plumbing, version bump waits for
  Round B). Do NOT bump version strings.
