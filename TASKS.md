# noxdev: Fix critic diff capture

# Problem: capture-diff.sh uses `git diff HEAD`, which shows working-tree changes vs last commit.
# When the agent commits its work, the "diff vs HEAD" is empty of real work — it contains only
# whatever uncommitted edits exist in the working tree (typically the agent's own TASKS.md
# metadata edits). Critic reviews a near-empty diff, correctly rejects, task fails falsely.
#
# Fix: diff the agent's committed work (pre-task-SHA..HEAD) instead of working-tree vs HEAD.
#
# This task fixes the critic's own infrastructure, so CRITIC: skip — classic chicken-and-egg.

## T1: Fix diff capture to use pre-task SHA as baseline
- STATUS: done
- FILES: packages/cli/scripts/docker-capture-diff.sh, packages/cli/src/docker/runner.ts, packages/cli/src/engine/orchestrator.ts
- VERIFY: cd packages/cli && pnpm build && grep -q 'pre_task_sha' dist/scripts/docker-capture-diff.sh && grep -q 'preTaskSha' dist/docker/runner.js && grep -q 'preTaskSha' dist/engine/orchestrator.js
- CRITIC: skip
- PUSH: auto
- SPEC: Change diff capture to use the pre-task commit SHA as the baseline, so the critic
  reviews what the agent actually committed rather than whatever uncommitted noise sits in
  the working tree.
  
  STEP 1 — Update packages/cli/scripts/docker-capture-diff.sh.
  
  Change the usage header comment and the argument handling to accept a third argument:
    Usage: docker-capture-diff.sh <worktree_dir> <output_file> <pre_task_sha>
    pre_task_sha is the git SHA of HEAD before the task's agent ran.
  
  Update the argument check from "-ne 2" to "-ne 3". Update the error message.
  
  Assign: pre_task_sha="$3"
  
  Replace the diff-generation block. New block:
    {
      echo "---COMMITTED---"
      # Diff from pre-task baseline to current HEAD — this is the agent's committed work.
      # If pre_task_sha == HEAD (agent committed nothing), this diff is empty.
      if [ "$pre_task_sha" != "$(git rev-parse HEAD)" ]; then
        git diff "$pre_task_sha..HEAD" || true
      fi
      echo "---UNCOMMITTED---"
      # Any uncommitted work the agent left in the worktree (rare but possible).
      git diff HEAD || true
      echo "---STAGED---"
      git diff --cached || true
      echo "---UNTRACKED---"
      git ls-files --others --exclude-standard | while IFS= read -r f; do
        echo "=== $f ==="
        cat "$f" 2>/dev/null || true
      done
    } > "$output_file"
  
  Keep the `git add -N .` before the block and the `git reset HEAD .` after — those handle
  untracked-file visibility, which is still needed for the UNTRACKED section.
  
  STEP 2 — Update packages/cli/src/docker/runner.ts.
  
  Change the captureDiff function signature from:
    export function captureDiff(worktreeDir: string, outputFile: string): boolean
  to:
    export function captureDiff(worktreeDir: string, outputFile: string, preTaskSha: string): boolean
  
  Pass preTaskSha as the third argument to the bash script invocation (execFileSync or similar).
  
  STEP 3 — Update packages/cli/src/engine/orchestrator.ts.
  
  Find the runCritic function signature. It currently does not receive preTaskSha. Add it as
  a parameter:
    async function runCritic(
      ctx: RunContext,
      task: Task,
      logDir: string,
      attempt: number,
      claudeJsonSrc: string,
      claudeSnapshot: string,
      preTaskSha: string,  // NEW
    ): Promise<{...}>
  
  Inside runCritic, the captureDiff call currently looks like:
    const hasDiff = captureDiff(ctx.worktreeDir, diffOutputFile);
  Change to:
    const hasDiff = captureDiff(ctx.worktreeDir, diffOutputFile, preTaskSha);
  
  Find the call site of runCritic inside executeTask. It currently passes claudeJsonSrc and
  claudeSnapshot. executeTask already receives the pre-task SHA as a parameter (inspect the
  signature — it's called with `lastSha` from the outer loop at orchestrator.ts around line 109).
  Whatever that parameter is named inside executeTask (likely `lastSha` or similar), pass it
  as preTaskSha to runCritic.
  
  If executeTask does NOT currently receive the pre-task SHA as a parameter (inspect carefully),
  capture it at the top of executeTask with:
    const preTaskSha = (await import('../docker/runner.js')).getCurrentSha(ctx.worktreeDir);
  and pass that down. But first preference is to use the existing lastSha parameter if present.
  
  Handle the null case: if the pre-task SHA is null or empty (first task, fresh worktree), fall
  back to "HEAD~1" as a string — git will resolve it if a prior commit exists, or the shell
  comparison `[ "$pre_task_sha" != "$(git rev-parse HEAD)" ]` will still work since HEAD~1 is
  not string-equal to the full HEAD SHA.
  
  STEP 4 — Add empty-diff guardrail in orchestrator runCritic.
  
  After `const diffContent = readFileSync(diffOutputFile, "utf-8");`, add:
    // Empty-diff guardrail: if the committed section is empty AND the uncommitted section
    // contains only TASKS.md changes, the agent didn't produce reviewable work. Skip critic
    // instead of sending an empty diff for rejection.
    const committedSection = diffContent.split('---UNCOMMITTED---')[0] || '';
    const committedHasWork = committedSection.replace('---COMMITTED---', '').trim().length > 0;
    if (!committedHasWork) {
      const uncommittedMatch = diffContent.match(/---UNCOMMITTED---\n([\s\S]*?)---STAGED---/);
      const uncommittedBody = uncommittedMatch ? uncommittedMatch[1].trim() : '';
      const onlyTasksMd = uncommittedBody.length === 0 ||
        (uncommittedBody.includes('TASKS.md') && !uncommittedBody.match(/^diff --git.*(?<!TASKS\.md)$/m));
      if (onlyTasksMd) {
        console.log(chalk.yellow("  ⚠ No substantive diff to review (only TASKS.md metadata), skipping critic"));
        return { rejected: false, reason: "empty diff", criticLogFile: null, diffFile: diffOutputFile };
      }
    }
  
  This ensures: if diff capture ever regresses again or the agent legitimately did no work,
  the critic is skipped rather than given nothing and asked to judge.
  
  STEP 5 — Update the existing hasDiff check.
  
  The current code checks `if (!hasDiff)` right after captureDiff. That checks whether the
  output file has any bytes, which it always will now (it always contains section headers).
  Either remove that check entirely (the new guardrail in STEP 4 supersedes it) or change it
  to check whether the combined diff has any actual diff lines:
    const hasRealDiff = diffContent.split('\n').some(l => l.startsWith('+') || l.startsWith('-'));
  Prefer removing the old check — the STEP 4 guardrail is the right one.
