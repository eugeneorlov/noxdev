# noxdev: Auto-approve PUSH:auto tasks at merge decision time

# Dependencies: Phase G complete, all manual fixes committed
# Gate: pnpm build
#
# Single task — focused change across run engine + merge command

## T1: Auto-approve PUSH:auto tasks in run engine and skip them in merge prompt
- STATUS: done
- FILES: packages/cli/src/commands/run.ts, packages/cli/src/commands/merge.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "merge_decision.*approved" src/commands/run.ts && grep -q "pending" src/commands/merge.ts
- CRITIC: skip
- PUSH: auto
- SPEC: Currently all tasks get merge_decision='pending' regardless of push mode.
  This means PUSH:auto and PUSH:gate behave identically at merge time — both
  require interactive approval. Fix this so the three-tier push model is meaningful
  end-to-end:
  
  PUSH:auto  → merge_decision='approved' set immediately after successful task
  PUSH:gate  → merge_decision='pending', requires interactive approval via noxdev merge
  PUSH:manual → merge_decision='pending', same as gate
  
  FILE 1: packages/cli/src/commands/run.ts
  
  Find where task_results are INSERT'd or UPDATE'd after a successful task completion.
  Look for where merge_decision is set to 'pending'. When the task's push mode is
  'auto' AND the task status is COMPLETED or COMPLETED_RETRY, set merge_decision
  to 'approved' and merged_at to datetime('now') instead of 'pending'.
  
  The push mode comes from the parsed TASKS.md task entry. The parser reads the
  PUSH field. Find how the task's push mode is accessed in run.ts (likely from the
  parsed task object) and use it in the conditional.
  
  Pseudocode for the change:
  ```
  const mergeDecision = (task.push === 'auto' && (status === 'COMPLETED' || status === 'COMPLETED_RETRY'))
    ? 'approved'
    : 'pending';
  // Use mergeDecision in the INSERT/UPDATE statement instead of hardcoded 'pending'
  // If mergeDecision is 'approved', also set merged_at to new Date().toISOString()
  ```
  
  FILE 2: packages/cli/src/commands/merge.ts
  
  Find the interactive merge loop where tasks are presented for approve/reject.
  Currently it queries all tasks with commits. Change the logic:
  
  1. Query task_results for the latest run. Separate into two groups:
     - Already approved (merge_decision = 'approved') — these are PUSH:auto tasks
     - Pending review (merge_decision = 'pending') — these are PUSH:gate tasks
  
  2. If there are auto-approved tasks, print a summary line:
     ```
     chalk.green(`  ✓ ${autoApproved.length} auto-approved tasks (PUSH: auto)`)
     ```
     Do NOT prompt for these — they're already decided.
  
  3. Only show the interactive approve/reject prompt for pending tasks.
     If there are zero pending tasks, skip the interactive loop entirely.
  
  4. After the interactive loop (or if skipped), proceed with the git merge
     as normal — merge all approved tasks (both auto and interactively approved).
  
  5. Print the final summary showing both:
     ```
     Summary: {autoApproved} auto-approved, {interactiveApproved} approved, {rejected} rejected
     ```
  
  Do NOT change: the git merge logic itself, the SQLite schema, the dashboard
  API routes, the reject/revert logic, or any other command.
