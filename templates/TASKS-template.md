# TASKS.md Template

A TASKS.md file is an execution unit. One file = one noxdev run. Archive or delete after the run's commits are merged to main.

## File-level metadata (optional but recommended as comments)

```markdown
# <release-name or feature-name>

# Scope: one-line summary
# Dependencies: what must exist in the repo before running
# Gate: what defines success for the run as a whole
# Related: FEATURE-*.md file, audit artifacts, etc.
```

## Per-task format

```markdown
## T<N>: <short directive title, verb-first>
- STATUS: pending
- FILES: comma-separated list of files this task will touch
- VERIFY: shell command that must exit 0 for the task to be considered done
- CRITIC: skip | review
- SPEC: The actual directive. Multi-line allowed. Include inline code, SQL, config.
  The more specific the better. Agents invent patterns when given descriptions;
  agents follow patterns when given working code.
```

## Field guide

### STATUS

- `pending` — not yet run
- `done` — completed successfully (set by noxdev, or manually when recovering)
- `failed` — task failed (set by noxdev)
- `skipped` — intentionally not run

### FILES

A hint for the agent, not a constraint. The agent can touch other files if the spec requires it. Use this to orient the agent, not to lock it down.

### VERIFY

A shell command. Exit 0 means pass, non-zero means fail. Design for what "works" means, not just what "compiles" means.

Good VERIFY examples:
- `cd packages/cli && pnpm build && node dist/index.js --help | grep -q "cost"`
- `grep -q "new_feature" src/feature.ts && ! grep -q "TODO" src/feature.ts`
- `cd backend && uv sync && uv run python -c "import app"`

Bad VERIFY examples:
- `echo ok` (verifies nothing)
- `cd packages/cli && pnpm build` (only catches syntax errors, not integration)
- `test -f dist/feature.js` (file exists but may be empty or broken)

### CRITIC

- `skip` — no critic review. Default for infrastructure changes, chicken-and-egg fixes, and mechanical work.
- `review` — critic agent reviews the diff. Use for changes where silent regressions hurt, or for any task with wide surface area.

### SPEC

The actual directive. Write it like you would write a pull request description for a junior engineer who has access to the codebase but not to your head.

- State what to do, not what the outcome should look like.
- Include working code inline when wrapping or promoting existing logic.
- Break down multi-step tasks into numbered steps.
- Forbid known failure modes explicitly ("do NOT touch X").

---

## Example task

```markdown
## T1: Add --since flag to noxdev cost command
- STATUS: pending
- FILES: packages/cli/src/commands/cost.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js cost --help | grep -q "since" && node dist/index.js cost --since 7d | grep -qi "tokens"
- CRITIC: skip
- SPEC: Add a --since flag that filters the cost summary by time window.
  Accept formats: '7d', '30d', 'YYYY-MM-DD', 'all' (default 'all').
  
  Steps:
  1. Add the option to the commander definition: .option('--since <spec>', 'Time window', 'all')
  2. Parse the flag value into a SQL WHERE clause:
     - '7d' → WHERE started_at >= date('now', '-7 days')
     - '30d' → WHERE started_at >= date('now', '-30 days')
     - 'YYYY-MM-DD' → WHERE started_at >= '<that date>'
     - 'all' → no WHERE clause
  3. Inject the clause into the existing SUM queries.
  4. Include the window in the output header: "noxdev cost — <project>  [since <spec>]"
  
  Do NOT change the output format for 'all' (backward compat with no flag).
```

---

## Run discipline

- One TASKS.md per run. Don't accumulate months of tasks in one file.
- Archive after merge: `mv TASKS.md archive/TASKS-<release>-<date>.md` or delete if not worth keeping.
- Never edit a task spec after it's run, even if the agent misread it. The spec is the record of what was attempted; the fix goes in the next spec.
